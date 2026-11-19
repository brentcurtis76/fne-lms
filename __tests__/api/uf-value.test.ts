// @vitest-environment node
/**
 * /api/uf-value — the application's own UF address (N89-route).
 *
 * The route reads today's UF from the SII's yearly page. It must answer
 * within a time limit, and when it cannot read today's value it must say so
 * and give NO value (never the fixed number under today's date).
 *
 * `fetch` is faked in every case: nothing here contacts sii.cl or any other
 * host. `AbortSignal.timeout` is replaced by an equivalent built on the faked
 * `setTimeout`, so that fake time can make the route's limit run out (Node's
 * own AbortSignal.timeout uses timers that vitest's fake timers do not reach).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/uf-value';

// Noon UTC on an invented "today": the same calendar day in UTC and in Chile.
const TODAY = '2026-11-18';
const NOW = new Date(`${TODAY}T15:00:00Z`);

// The smallest page the route's own parser (extractUFFromSII) accepts: the
// month's name, a <table>, and a row «<td>DD</td><td>XX.XXX,XX</td>» for
// today's day. Derived by reading the parser's three regular expressions
// (month name …<table>, </table>, and the day/value pair). Value invented.
const SII_PAGE = `<html><body><h2>Noviembre</h2><table>
<tr><td>17</td><td>40.111,11</td></tr>
<tr><td>18</td><td>40.123,45</td></tr>
</table></body></html>`;

let fetchMock: ReturnType<typeof vi.fn>;

function textResponse(body: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

async function call(method = 'GET') {
  const { req, res } = createMocks({ method });
  await handler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
    return controller.signal;
  });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/api/uf-value', () => {
  it("a page holding today's value → 200 success with that value under today's date (unchanged)", async () => {
    fetchMock.mockResolvedValue(textResponse(SII_PAGE));
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true, valor: 40123.45, fecha: TODAY });
    // Send-back 1: a success is cached ten minutes, never served stale.
    expect(res.getHeader('Cache-Control')).toBe('public, s-maxage=600');
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.sii.cl/valores_y_fechas/uf/uf2026.htm');
  });

  it('an outside fetch that never settles → the route answers within the limit, success false, an error, no value', async () => {
    // Never answers by itself; gives up only when its signal is aborted.
    fetchMock.mockImplementation((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }));
    const { req, res } = createMocks({ method: 'GET' });
    const pending = handler(req as any, res as any);
    await vi.advanceTimersByTimeAsync(5100);
    expect(res._isEndCalled()).toBe(true);
    await pending;
    const body = res._getJSONData();
    expect(res._getStatusCode()).toBe(200);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body).not.toHaveProperty('valor');
    expect(body).not.toHaveProperty('fecha');
    expect(res.getHeader('Cache-Control')).toBeUndefined();
  });

  it.each([
    ['the outside page answers 500', () => textResponse('error', 500)],
    ['the outside page holds no value', () => textResponse('<html><body>Sin datos</body></html>')],
    ['the outside fetch fails', () => Promise.reject(new Error('offline'))],
  ])('%s → success false, the error text, no value and no date', async (_label, answer) => {
    fetchMock.mockImplementation(answer as any);
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: false, error: 'No se pudo obtener la UF de hoy' });
    expect(res.getHeader('Cache-Control')).toBeUndefined();
  });

  it('passes an abort signal to the outside fetch', async () => {
    fetchMock.mockResolvedValue(textResponse(SII_PAGE));
    await call();
    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
  });

  describe("send-back 1: today is Chile's day, and only today's row is a success", () => {
    // Invented values; the 18th's row is the one asked for at 22:30 in Chile.
    const row = (day: string, value: string) => `<tr><td>${day}</td><td>${value}</td></tr>`;
    const page = (...rows: string[]) => `<html><body><h2>Noviembre</h2><table>\n${rows.join('\n')}\n</table></body></html>`;

    it("at 2026-11-19T01:30:00Z (22:30 on the 18th in Chile) the route asks for the 18th's row", async () => {
      vi.setSystemTime(new Date('2026-11-19T01:30:00Z'));
      fetchMock.mockResolvedValue(textResponse(page(row('17', '40.111,11'), row('18', '40.123,45'), row('19', '40.150,00'))));
      const res = await call();
      expect(res._getJSONData()).toEqual({ success: true, valor: 40123.45, fecha: '2026-11-18' });
      expect(fetchMock.mock.calls[0][0]).toBe('https://www.sii.cl/valores_y_fechas/uf/uf2026.htm');
    });

    it('a page that has the 17th and the 19th but not the 18th → success false, no value', async () => {
      vi.setSystemTime(new Date('2026-11-19T01:30:00Z'));
      fetchMock.mockResolvedValue(textResponse(page(row('17', '40.111,11'), row('19', '40.150,00'))));
      const res = await call();
      expect(res._getJSONData()).toEqual({ success: false, error: 'No se pudo obtener la UF de hoy' });
      expect(res.getHeader('Cache-Control')).toBeUndefined();
    });

    it("a page with the 18th → success with fecha '2026-11-18' and the header exactly «public, s-maxage=600»", async () => {
      vi.setSystemTime(new Date('2026-11-19T01:30:00Z'));
      fetchMock.mockResolvedValue(textResponse(page(row('18', '40.123,45'))));
      const res = await call();
      expect(res._getJSONData()).toEqual({ success: true, valor: 40123.45, fecha: '2026-11-18' });
      expect(res.getHeader('Cache-Control')).toBe('public, s-maxage=600');
    });
  });

  describe("send-back 2: the requested day is matched as a number, and only that row's value is returned", () => {
    // Invented values. Noon in Chile on 2 November: the 2nd's row is asked for.
    const row = (day: string, value: string) => `<tr><td>${day}</td><td>${value}</td></tr>`;
    const page = (...rows: string[]) => `<html><body><h2>Noviembre</h2><table>\n${rows.join('\n')}\n</table></body></html>`;
    const SECOND = new Date('2026-11-02T15:00:00Z');

    it.each([
      ["'2'", '2'],
      ["'02'", '02'],
      ["' 2 ' (spaces in the cell)", ' 2 '],
    ])('on the 2nd, a row whose day reads %s → success with 40123.45 (the found row, unrounded as before)', async (_label, day) => {
      vi.setSystemTime(SECOND);
      fetchMock.mockResolvedValue(textResponse(page(row('1', '40.100,00'), row(day, '40.123,45'), row('3', '40.150,00'))));
      const res = await call();
      expect(res._getJSONData()).toEqual({ success: true, valor: 40123.45, fecha: '2026-11-02' });
      expect(res.getHeader('Cache-Control')).toBe('public, s-maxage=600');
    });

    it('on the 2nd, a page that has 12, 20 and 22 but not 2 → success false, no value', async () => {
      vi.setSystemTime(SECOND);
      fetchMock.mockResolvedValue(textResponse(page(row('12', '40.112,00'), row('20', '40.120,00'), row('22', '40.122,00'))));
      const res = await call();
      expect(res._getJSONData()).toEqual({ success: false, error: 'No se pudo obtener la UF de hoy' });
      expect(res.getHeader('Cache-Control')).toBeUndefined();
    });
  });

  it('a method other than GET is still refused with 405', async () => {
    const res = await call('POST');
    expect(res._getStatusCode()).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
