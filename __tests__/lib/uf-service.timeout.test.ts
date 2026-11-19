// @vitest-environment node
/**
 * lib/uf-service.ts — getCurrentUF with a time limit and an honest source
 * (N89-service, also the review's GES-3.13).
 *
 * `fetch` is faked in every case: nothing here contacts the application,
 * mindicador.cl or cmfchile.cl. The module exports only its one instance, so
 * every test calls its clearCache() and gives it a fresh fake storage.
 * The browser is imitated by stubbing `window` (with a fake `localStorage`)
 * on a node environment; test (7) leaves `window` out, as on the server.
 * `AbortSignal.timeout` is replaced by an equivalent built on the faked
 * `setTimeout` (Node's own uses timers that vitest's fake timers do not reach).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UFService from '../../lib/uf-service';

const KEY = 'genera.uf.lastLive';
const DAY1 = '2026-11-17';
const DAY2 = '2026-11-18';
const at = (day: string) => new Date(`${day}T15:00:00Z`);

let fetchMock: ReturnType<typeof vi.fn>;

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => (data.has(k) ? data.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => void data.set(k, String(v))),
    removeItem: vi.fn((k: string) => void data.delete(k)),
  };
}
function asBrowser(storage: unknown) {
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('localStorage', storage);
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const hangs = (_url: string, init?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  });
const routeLive = (fecha: string, valor: number) => json({ success: true, valor, fecha });
const failEverywhere = () => fetchMock.mockImplementation(async () => json({ error: 'down' }, 500));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(DAY2));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
    return controller.signal;
  });
  vi.stubEnv('NEXT_PUBLIC_CMF_API_KEY', 'invented-test-key');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  UFService.clearCache();
});

afterEach(() => {
  UFService.clearCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('UFService.getCurrentUF — time limit and source', () => {
  it('(1) every source hangs → settles within 16 s of fake time with the fixed value of 29 May 2025', async () => {
    asBrowser(fakeStorage());
    fetchMock.mockImplementation(hangs as any);
    let result: any;
    const pending = UFService.getCurrentUF().then((v) => (result = v));
    await vi.advanceTimersByTimeAsync(16000);
    expect(result).toBeDefined();
    await pending;
    expect(result).toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("(2) the first source says success false without a value, the second has today's value → live", async () => {
    asBrowser(fakeStorage());
    fetchMock
      .mockResolvedValueOnce(json({ success: false, error: 'No se pudo obtener la UF de hoy' }))
      .mockResolvedValueOnce(json({ serie: [{ fecha: `${DAY2}T03:00:00.000Z`, valor: 40123.45 }] }));
    const result = await UFService.getCurrentUF();
    expect(result).toEqual({ fecha: DAY2, valor: 40123, source: 'live' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/uf-value');
    expect(fetchMock.mock.calls[1][0]).toBe('https://mindicador.cl/api/uf');
  });

  it('(2b) an old-style answer of the address, success false WITH a value, is not taken as a value', async () => {
    asBrowser(fakeStorage());
    fetchMock
      .mockResolvedValueOnce(json({ success: false, valor: 39184, fecha: DAY2, error: 'Using fallback value' }))
      .mockResolvedValueOnce(json({ error: 'down' }, 500))
      .mockResolvedValueOnce(json({ error: 'down' }, 500));
    const result = await UFService.getCurrentUF();
    expect(result.source).toBe('fixed');
    expect(result.fecha).toBe('2025-05-29');
  });

  it("(3) a live value of yesterday, every source failing today → last-known with yesterday's value AND date", async () => {
    const storage = fakeStorage();
    asBrowser(storage);
    vi.setSystemTime(at(DAY1));
    fetchMock.mockResolvedValueOnce(routeLive(DAY1, 40111.11));
    expect(await UFService.getCurrentUF()).toEqual({ fecha: DAY1, valor: 40111.11, source: 'live' });

    vi.setSystemTime(at(DAY2));
    failEverywhere();
    expect(await UFService.getCurrentUF()).toEqual({ fecha: DAY1, valor: 40111.11, source: 'last-known' });
  });

  it('(4) the live value is stored for later days; a failing day does not overwrite it', async () => {
    const storage = fakeStorage();
    asBrowser(storage);
    vi.setSystemTime(at(DAY1));
    fetchMock.mockResolvedValueOnce(routeLive(DAY1, 40111.11));
    await UFService.getCurrentUF();
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ fecha: DAY1, valor: 40111.11 });

    vi.setSystemTime(at(DAY2));
    failEverywhere();
    await UFService.getCurrentUF();
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ fecha: DAY1, valor: 40111.11 });

    // A non-live answer never goes into the in-memory cache: the next call asks again.
    const callsBefore = fetchMock.mock.calls.length;
    vi.setSystemTime(at('2026-11-19'));
    await UFService.getCurrentUF();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ fecha: DAY1, valor: 40111.11 });
  });

  it('(4b) only a live value is cached for today: a fixed answer is asked again on the next call after its minute', async () => {
    asBrowser(fakeStorage());
    failEverywhere();
    await UFService.getCurrentUF();
    const first = fetchMock.mock.calls.length;
    fetchMock.mockReset();
    // Send-back 1: a non-live result is remembered for 60 seconds.
    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockResolvedValueOnce(routeLive(DAY2, 40123.45));
    expect(await UFService.getCurrentUF()).toEqual({ fecha: DAY2, valor: 40123.45, source: 'live' });
    expect(first).toBe(3);
    // and now it is cached
    fetchMock.mockReset();
    expect(await UFService.getCurrentUF()).toEqual({ fecha: DAY2, valor: 40123.45, source: 'live' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'nonsense{'],
    ['a negative value', JSON.stringify({ fecha: DAY1, valor: -5 })],
    ['a zero value', JSON.stringify({ fecha: DAY1, valor: 0 })],
    ['a value that is not a number', JSON.stringify({ fecha: DAY1, valor: '40111' })],
    ['a non-finite value (stored as null)', JSON.stringify({ fecha: DAY1, valor: Infinity })],
    ['no date', JSON.stringify({ valor: 40111.11 })],
  ])('(5) a stored value that is %s is ignored → fixed', async (_label, stored) => {
    asBrowser(fakeStorage({ [KEY]: stored }));
    failEverywhere();
    expect(await UFService.getCurrentUF()).toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
  });

  it('(5b) a storage that throws on read and on write is ignored, nothing throws', async () => {
    const storage = fakeStorage();
    storage.getItem.mockImplementation(() => { throw new Error('denied'); });
    storage.setItem.mockImplementation(() => { throw new Error('denied'); });
    asBrowser(storage);
    failEverywhere();
    await expect(UFService.getCurrentUF()).resolves.toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    UFService.clearCache();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(routeLive(DAY2, 40123.45));
    await expect(UFService.getCurrentUF()).resolves.toEqual({ fecha: DAY2, valor: 40123.45, source: 'live' });
  });

  it('(6) each fetch call carries an abort signal of 5 seconds', async () => {
    asBrowser(fakeStorage());
    failEverywhere();
    await UFService.getCurrentUF();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
  });

  it('(7) on the server (no window, no localStorage) the service works without storage', async () => {
    expect(typeof (globalThis as any).window).toBe('undefined');
    failEverywhere();
    await expect(UFService.getCurrentUF()).resolves.toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    fetchMock.mockReset();
    // Send-back 1: a non-live result is remembered for 60 seconds.
    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockResolvedValueOnce(routeLive(DAY2, 40123.45));
    await expect(UFService.getCurrentUF()).resolves.toEqual({ fecha: DAY2, valor: 40123.45, source: 'live' });
  });
});
