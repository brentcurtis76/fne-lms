// @vitest-environment node
/**
 * lib/uf-service.ts — send-back 1 of F15d: what counts as today's UF.
 *
 * - "Today" is the calendar day in America/Santiago (todayInChile).
 * - A source's answer is `live` only when its number is finite and between
 *   10,000 and 1,000,000 AND its own date is today in Chile; otherwise it is
 *   ignored (neither cached, nor stored, nor used) and the next source is asked.
 * - The stored last value is used only when its number passes, its date is a
 *   real calendar date and not after today in Chile.
 * - The fetch helper's time limit covers fetching AND reading the body.
 * - projectUF holds the projection arithmetic; getProjectedUF is built on it.
 * - A result that is not live is remembered for 60 seconds.
 *
 * `fetch` is faked in every case: nothing here contacts the application,
 * mindicador.cl or cmfchile.cl. The module exports only its one instance, so
 * every test calls its clearCache() and gives it a fresh fake storage. The
 * browser is imitated by stubbing `window` (with a fake `localStorage`).
 * All values are invented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UFService, { todayInChile, projectUF, type UFValue } from '../../lib/uf-service';

const KEY = 'genera.uf.lastLive';
const YESTERDAY = '2026-11-17';
const TODAY = '2026-11-18';
// 15:00 UTC = 12:00 in Chile: the same calendar day in both.
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
const down = () => json({ error: 'down' }, 500);

// The shape each source's reader parses.
const routeAnswer = (fecha: string, valor: unknown) => json({ success: true, valor, fecha });
// mindicador dates its record with the instant of midnight in Chile.
const mindicadorAnswer = (fecha: string, valor: unknown) =>
  json({ serie: [{ fecha: `${fecha}T03:00:00.000Z`, valor }] });
// CMF gives its value as text; the reader removes one comma, then parseFloat.
const cmfAnswer = (fecha: string, valor: unknown) => json({ UFs: [{ Fecha: fecha, Valor: valor }] });

type Source = 'route' | 'mindicador' | 'cmf';
const isFor = (url: string): Source =>
  url === '/api/uf-value' ? 'route' : url.startsWith('https://mindicador.cl') ? 'mindicador' : 'cmf';

/** Answer each source by its address; a source left out answers 500. */
function serve(answers: Partial<Record<Source, () => unknown>>) {
  fetchMock.mockImplementation(async (url: string) => {
    const answer = answers[isFor(url)];
    return answer ? answer() : down();
  });
}
const callsTo = (source: Source) => fetchMock.mock.calls.filter((c) => isFor(c[0]) === source).length;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at(TODAY));
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

describe('todayInChile', () => {
  it.each([
    ['2026-11-19T01:30:00Z', '2026-11-18'], // 22:30 on the 18th in Chile (summer, UTC-3)
    ['2026-11-19T03:30:00Z', '2026-11-19'], // 00:30 on the 19th
    ['2026-06-15T03:30:00Z', '2026-06-14'], // 23:30 on the 14th (winter, UTC-4)
    ['2026-06-15T04:30:00Z', '2026-06-15'], // 00:30 on the 15th
  ])('%s → %s', (instant, day) => {
    expect(todayInChile(new Date(instant))).toBe(day);
  });

  it("decides the service's day: at 22:30 in Chile on the 18th, the 18th's value is today's, the 19th's is not", async () => {
    asBrowser(fakeStorage());
    vi.setSystemTime(new Date('2026-11-19T01:30:00Z'));
    serve({ route: () => routeAnswer('2026-11-19', 40150) });
    expect((await UFService.getCurrentUF()).source).toBe('fixed');
    UFService.clearCache();
    serve({ route: () => routeAnswer('2026-11-18', 40123) });
    expect(await UFService.getCurrentUF()).toEqual({ fecha: '2026-11-18', valor: 40123, source: 'live' });
  });
});

describe('fetch helper — the time limit covers reading the body', () => {
  // Headers arrive, the body never does.
  const stalledBody = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });

  it('with AbortSignal.timeout present: a stalled body is cut off at 5 s per source', async () => {
    asBrowser(fakeStorage());
    fetchMock.mockImplementation(stalledBody);
    let result: UFValue | undefined;
    const pending = UFService.getCurrentUF().then((v) => (result = v));
    await vi.advanceTimersByTimeAsync(4900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11200); // 3 sources × 5 s, plus slack
    expect(result).toBeDefined();
    await pending;
    expect(result).toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('with AbortSignal.timeout removed: a stalled body is cut off at 5 s per source, and no timer is left behind', async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')!;
    delete (AbortSignal as any).timeout;
    try {
      expect(typeof (AbortSignal as any).timeout).toBe('undefined');
      asBrowser(fakeStorage());
      fetchMock.mockImplementation(stalledBody);
      let result: UFValue | undefined;
      const pending = UFService.getCurrentUF().then((v) => (result = v));
      await vi.advanceTimersByTimeAsync(4900);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(11200);
      expect(result).toBeDefined();
      await pending;
      expect(result!.source).toBe('fixed');
      expect(vi.getTimerCount()).toBe(0);

      // On success and on a failure the timer is cleared too.
      UFService.clearCache();
      serve({ route: () => routeAnswer(TODAY, 40123) });
      expect((await UFService.getCurrentUF()).source).toBe('live');
      expect(vi.getTimerCount()).toBe(0);
      UFService.clearCache();
      fetchMock.mockImplementation(async () => { throw new Error('offline'); });
      // (today's live value is now the stored last value)
      expect((await UFService.getCurrentUF()).source).toBe('last-known');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      Object.defineProperty(AbortSignal, 'timeout', original);
    }
  });
});

describe('each source: only today\'s usable number is live', () => {
  const answerOf: Record<Source, (fecha: string, valor: unknown) => unknown> = {
    route: routeAnswer,
    mindicador: mindicadorAnswer,
    cmf: cmfAnswer,
  };
  // What a good value of 40,123 looks like in each source's own shape.
  const good: Record<Source, unknown> = { route: 40123, mindicador: 40123, cmf: '40123' };

  it.each(['route', 'mindicador', 'cmf'] as Source[])("%s: today's good value → live, cached and stored", async (source) => {
    const storage = fakeStorage();
    asBrowser(storage);
    serve({ [source]: () => answerOf[source](TODAY, good[source]) });
    expect(await UFService.getCurrentUF()).toEqual({ fecha: TODAY, valor: 40123, source: 'live' });
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ fecha: TODAY, valor: 40123 });
    const calls = fetchMock.mock.calls.length;
    expect(await UFService.getCurrentUF()).toEqual({ fecha: TODAY, valor: 40123, source: 'live' });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("route: yesterday's date (a CDN serving yesterday's success again) → ignored, mindicador is asked", async () => {
    asBrowser(fakeStorage());
    serve({ route: () => routeAnswer(YESTERDAY, 40111), mindicador: () => mindicadorAnswer(TODAY, 40123) });
    expect(await UFService.getCurrentUF()).toEqual({ fecha: TODAY, valor: 40123, source: 'live' });
    expect(callsTo('mindicador')).toBe(1);
  });

  it("mindicador: a first record of yesterday → ignored, CMF is asked", async () => {
    asBrowser(fakeStorage());
    serve({ mindicador: () => mindicadorAnswer(YESTERDAY, 40111), cmf: () => cmfAnswer(TODAY, '40123') });
    expect(await UFService.getCurrentUF()).toEqual({ fecha: TODAY, valor: 40123, source: 'live' });
    expect(callsTo('cmf')).toBe(1);
  });

  it("cmf: a first record of yesterday → ignored (it is the last source: the fixed value)", async () => {
    asBrowser(fakeStorage());
    serve({ cmf: () => cmfAnswer(YESTERDAY, '40111') });
    expect((await UFService.getCurrentUF()).source).toBe('fixed');
  });

  // The route and mindicador hand over a JSON number; CMF hands over text.
  const badValues: Array<[Source, string, unknown]> = [
    ...(['route', 'mindicador'] as Source[]).flatMap((s): Array<[Source, string, unknown]> => [
      [s, '0', 0],
      [s, '-1', -1],
      [s, "'39184' (a text)", '39184'],
      [s, 'NaN', NaN],
      [s, '5', 5],
      [s, '5,000,000', 5000000],
    ]),
    ['cmf', "'0'", '0'],
    ['cmf', "'-1'", '-1'],
    ['cmf', '39184 (a number, not its text)', 39184],
    ['cmf', "'NaN'", 'NaN'],
    ['cmf', "'5'", '5'],
    ['cmf', "'5,000,000'", '5,000,000'],
  ];

  it.each(badValues)('%s: valor %s → ignored, the next source is asked, nothing cached or stored', async (source, _label, valor) => {
    const storage = fakeStorage();
    asBrowser(storage);
    serve({ [source]: () => answerOf[source](TODAY, valor) });
    const result = await UFService.getCurrentUF();
    expect(result).toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storage.setItem).not.toHaveBeenCalled();
    // Not cached as today's: once the 60-second memory of the non-live answer
    // has passed, the next call asks the sources again.
    vi.setSystemTime(Date.now() + 61_000);
    await UFService.getCurrentUF();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("a good stored value survives a day of ignored answers", async () => {
    const storage = fakeStorage({ [KEY]: JSON.stringify({ fecha: YESTERDAY, valor: 40111.11 }) });
    asBrowser(storage);
    serve({
      route: () => routeAnswer(TODAY, 5),
      mindicador: () => mindicadorAnswer(YESTERDAY, 40111),
      cmf: () => cmfAnswer(TODAY, '-1'),
    });
    expect(await UFService.getCurrentUF()).toEqual({ fecha: YESTERDAY, valor: 40111.11, source: 'last-known' });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ fecha: YESTERDAY, valor: 40111.11 });
  });
});

describe('the stored last value', () => {
  it.each([
    ['an impossible date (2026-02-30)', { fecha: '2026-02-30', valor: 40111.11 }],
    ['a date after today in Chile', { fecha: '2026-11-19', valor: 40111.11 }],
    ['an absurd number (1e308)', { fecha: YESTERDAY, valor: 1e308 }],
    ['a number below 10,000 (9,999)', { fecha: YESTERDAY, valor: 9999 }],
  ])('%s → rejected, the fixed value is used', async (_label, stored) => {
    // 22:30 in Chile on the 18th (already the 19th in UTC): the 19th is still the future.
    vi.setSystemTime(new Date('2026-11-19T01:30:00Z'));
    asBrowser(fakeStorage({ [KEY]: JSON.stringify(stored) }));
    serve({});
    expect(await UFService.getCurrentUF()).toEqual({ fecha: '2025-05-29', valor: 39184, source: 'fixed' });
  });

  it("yesterday's good value → last-known", async () => {
    asBrowser(fakeStorage({ [KEY]: JSON.stringify({ fecha: YESTERDAY, valor: 40111.11 }) }));
    serve({});
    expect(await UFService.getCurrentUF()).toEqual({ fecha: YESTERDAY, valor: 40111.11, source: 'last-known' });
  });
});

describe('projectUF', () => {
  // The arithmetic getProjectedUF did before this send-back, written out.
  function oldFormula(valor: number, futureDate: string, now: Date): number {
    const targetDate = new Date(futureDate);
    const monthsDiff =
      (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    return Math.round(valor * Math.pow(1 + 0.0021, monthsDiff));
  }
  const base: UFValue = { fecha: TODAY, valor: 40000, source: 'live' };

  it.each([
    ['2026-12-15', 40084],
    ['2027-06-15', 40592],
    ['2027-11-15', 41020],
  ])('for %s: the old formula, projectUF and getProjectedUF give the same number', async (date, expected) => {
    expect(oldFormula(40000, date, new Date())).toBe(expected);
    expect(projectUF(base, date)).toEqual({ fecha: date, valor: expected, source: 'live' });
    asBrowser(fakeStorage());
    serve({ route: () => routeAnswer(TODAY, 40000) });
    expect(await UFService.getProjectedUF(date)).toEqual(projectUF(base, date));
  });

  it('carries the source of its base through', () => {
    expect(projectUF({ fecha: '2025-05-29', valor: 39184, source: 'fixed' }, '2026-12-15').source).toBe('fixed');
  });
});

describe('the 60-second memory of a result that is not live', () => {
  it('two calls within a minute during a total outage make ONE round of requests; after 61 s a new round', async () => {
    asBrowser(fakeStorage());
    serve({});
    expect((await UFService.getCurrentUF()).source).toBe('fixed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.now() + 30_000);
    expect((await UFService.getCurrentUF()).source).toBe('fixed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.now() + 31_000);
    expect((await UFService.getCurrentUF()).source).toBe('fixed');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('a live result is never shadowed by it', async () => {
    asBrowser(fakeStorage());
    serve({});
    expect((await UFService.getCurrentUF()).source).toBe('fixed');
    vi.setSystemTime(Date.now() + 61_000);
    serve({ route: () => routeAnswer(TODAY, 40123) });
    expect(await UFService.getCurrentUF()).toEqual({ fecha: TODAY, valor: 40123, source: 'live' });
    // The sources fail again within the minute: the cached live value is answered, not the old fixed one.
    serve({});
    vi.setSystemTime(Date.now() + 10_000);
    expect(await UFService.getCurrentUF()).toEqual({ fecha: TODAY, valor: 40123, source: 'live' });
  });
});
