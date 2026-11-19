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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import handler, { extractUFFromSII } from '../../pages/api/uf-value';

// Noon UTC on an invented "today": the same calendar day in UTC and in Chile.
const TODAY = '2026-11-18';
const NOW = new Date(`${TODAY}T15:00:00Z`);

// The smallest page the route's own parser (extractUFFromSII) accepts: the
// month's name, a <table>, and a row «<td>DD</td><td>XX.XXX,XX</td>» for
// today's day. Derived by reading the parser's three regular expressions
// (month name …<table>, </table>, and the day/value pair). Value invented.
const SII_PAGE = `<html><body><h2>Noviembre</h2><table>
<tr><th colspan='6'><h2>Noviembre</h2></th></tr>
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
    const page = (...rows: string[]) => `<html><body><h2>Noviembre</h2><table>\n<tr><th colspan='6'><h2>Noviembre</h2></th></tr>\n${rows.join('\n')}\n</table></body></html>`;

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
    const page = (...rows: string[]) => `<html><body><h2>Noviembre</h2><table>\n<tr><th colspan='6'><h2>Noviembre</h2></th></tr>\n${rows.join('\n')}\n</table></body></html>`;
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

/**
 * N187 — the SII's REAL yearly page. The fixture is a byte-for-byte copy of
 * https://www.sii.cl/valores_y_fechas/uf/uf2026.htm as it was on 18 Nov 2026
 * (a public page; no personal data). Each month is a block
 * `<div class='meses' id='mes_<month>'>` holding one table, newest month
 * first, after a list of options naming every month; a day is written
 * `<th width='40'><strong>18</strong></th> <td width='200'>41.357,30</td>`,
 * three days per row. Every value below is read from the fixture by eye and
 * written here; none is computed.
 */
describe('N187: the route reads the real SII page (fixture of 18 Nov 2026)', () => {
  const REAL_PAGE = readFileSync(join(__dirname, '..', 'fixtures', 'sii-uf-2026-11-18.htm'), 'utf8');
  const NO_VALUE = { success: false, error: 'No se pudo obtener la UF de hoy' };
  // Noon in Chile (UTC-3 in October, November and December 2026).
  const noonInChile = (date: string) => new Date(`${date}T12:00:00-03:00`);

  async function callOn(date: string, page = REAL_PAGE) {
    vi.setSystemTime(noonInChile(date));
    fetchMock.mockResolvedValue(textResponse(page));
    return call();
  }

  it("(1) 18 Nov 2026 → success, 41357.3, fecha '2026-11-18', cached ten minutes", async () => {
    const res = await callOn('2026-11-18');
    expect(res._getJSONData()).toEqual({ success: true, valor: 41357.3, fecha: '2026-11-18' });
    expect(res.getHeader('Cache-Control')).toBe('public, s-maxage=600');
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.sii.cl/valores_y_fechas/uf/uf2026.htm');
  });

  it.each([
    ['2026-11-01', 41252.94], // «41.252,94» (first column)
    ['2026-11-02', 41258.26], // «41.258,26»
    ['2026-11-10', 41302.33], // «41.302,33» (first column, last row with a value)
    ['2026-11-20', 41371.05], // «41.371,05» (second column)
    ['2026-11-30', 41439.89], // «41.439,89» (third column)
  ])('(2) %s → success with %s', async (date, valor) => {
    const res = await callOn(date);
    expect(res._getJSONData()).toEqual({ success: true, valor, fecha: date });
  });

  it('(3) the reader asked for 31 November (a cell with no value) → null', () => {
    expect(extractUFFromSII(REAL_PAGE, '11', 31)).toBeNull();
  });

  it("(4) 1 Dec 2026, a day with a value on the page → December's 41446.78", async () => {
    const res = await callOn('2026-12-01');
    expect(res._getJSONData()).toEqual({ success: true, valor: 41446.78, fecha: '2026-12-01' });
  });

  it('(4) 15 Dec 2026, a day whose value cell is still empty → success false, no value', async () => {
    const res = await callOn('2026-12-15');
    expect(res._getJSONData()).toEqual(NO_VALUE);
    expect(res.getHeader('Cache-Control')).toBeUndefined();
  });

  it("(5) 15 Oct 2026 → October's 41162.73, not November's 41336.67 nor December's (empty) cell", async () => {
    const res = await callOn('2026-10-15');
    expect(res._getJSONData()).toEqual({ success: true, valor: 41162.73, fecha: '2026-10-15' });
  });

  it("(6) a cut page with no November block → the reader gives null (never another month's value)", () => {
    const start = REAL_PAGE.indexOf("<div class='meses' id='mes_noviembre'>");
    const end = REAL_PAGE.indexOf("<div class='meses' id='mes_octubre'>");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const cut = REAL_PAGE.slice(0, start) + REAL_PAGE.slice(end);
    expect(extractUFFromSII(cut, '11', 18)).toBeNull();
    // The same cut page still holds October: the reader is not broken by the cut.
    expect(extractUFFromSII(cut, '10', 15)).toBe(41162.73);
  });

  describe('(6b) the staged pages of the blind test of 18 Nov', () => {
    // Clock: 18 Nov 2026 at noon in Chile. Values invented (as in the blind test).
    const valuePage = (value: string) =>
      `<h2>Noviembre</h2><table><tr><th colspan='6'><h2>Noviembre</h2></th></tr><tr><td>18</td><td>${value}</td></tr></table>`;

    it("a list of month names before October's table → November never gets October's value", async () => {
      const page = `<nav>Noviembre</nav>
<h2>Octubre</h2><table><tr><th colspan='6'><h2>Octubre</h2></th></tr><tr><td>18</td><td>40.000,00</td></tr></table>
<h2>Noviembre</h2><table><tr><th colspan='6'><h2>Noviembre</h2></th></tr><tr><td>18</td><td>41.357,30</td></tr></table>`;
      const res = await callOn('2026-11-18', page);
      expect(res._getJSONData()).not.toHaveProperty('valor', 40000);
      expect(res._getJSONData()).toEqual({ success: true, valor: 41357.3, fecha: '2026-11-18' });
    });

    it.each([
      ['41357.30', '41357.30'],
      ['41.357,30,99', '41.357,30,99'],
      ['41.357,30.99', '41.357,30.99'],
      ['1', '1'],
      ['99999999', '99999999'],
      ['400 nines', '9'.repeat(400)],
    ])('the value written %s → success false, no value', async (_label, value) => {
      const res = await callOn('2026-11-18', valuePage(value));
      expect(res._getJSONData()).toEqual(NO_VALUE);
      expect(res.getHeader('Cache-Control')).toBeUndefined();
    });

    it("the value written ' 41.357,30 ' (spaces around) → 41357.3", async () => {
      const res = await callOn('2026-11-18', valuePage(' 41.357,30 '));
      expect(res._getJSONData()).toEqual({ success: true, valor: 41357.3, fecha: '2026-11-18' });
    });

    it.each([
      ['41.357,30', 41357.3],
      ['41357,30', 41357.3],
      ['41357', 41357],
      ['41.357', 41357],
    ])('the value written %s (the Chilean way) → %s', async (value, valor) => {
      const res = await callOn('2026-11-18', valuePage(value));
      expect(res._getJSONData()).toEqual({ success: true, valor, fecha: '2026-11-18' });
    });
  });

  describe("send-back 1: a table is the month's only if its own first row names the month, and only a plain table is read", () => {
    // The three pages of the second reading's "Changes needed", exactly as written there.
    const BLOCK_WITHOUT_TABLE = `<div id='mes_noviembre'></div>
<h2>Octubre</h2>
<table><tr><td>18</td><td>41.178,64</td></tr></table>`;
    const HEADING_IN_A_DATA_CELL = `<div id='mes_octubre'>
  <table>
    <tr><th>Octubre</th></tr>
    <tr><td><h2>Noviembre</h2></td></tr>
    <tr><td>18</td><td>41.178,64</td></tr>
  </table>
</div>`;
    const NESTED_TABLE = `<div id='mes_noviembre'>
  <table>
    <tr><td><table>
      <tr><td>18</td><td>40.000,00</td></tr>
    </table></td></tr>
    <tr><th>18</th><td>41.357,30</td></tr>
  </table>
</div>`;

    it("(1) the month's block holds no table → null (never the next table, another month's)", () => {
      expect(extractUFFromSII(BLOCK_WITHOUT_TABLE, '11', 18)).toBeNull();
    });

    it('(1) the same page through the route → success false, no value', async () => {
      const res = await callOn('2026-11-18', BLOCK_WITHOUT_TABLE);
      expect(res._getJSONData()).toEqual(NO_VALUE);
      expect(res.getHeader('Cache-Control')).toBeUndefined();
    });

    it("(2) no block for the month, its name only in a data cell of another month's table → null", () => {
      expect(extractUFFromSII(HEADING_IN_A_DATA_CELL, '11', 18)).toBeNull();
    });

    it("(3) a table nested inside the month's table → null (never the inner table's value)", () => {
      expect(extractUFFromSII(NESTED_TABLE, '11', 18)).toBeNull();
    });

    it("a block whose table's first-row heading names ANOTHER month → null", () => {
      const page = `<div class='meses' id='mes_noviembre'><table>
<tr><th colspan='6'><h2>Octubre</h2></th></tr>
<tr><th width='40'><strong>18</strong></th> <td width='200'>41.178,64</td></tr>
</table></div>`;
      expect(extractUFFromSII(page, '11', 18)).toBeNull();
    });

    it("a page without blocks whose table's first row is <th>Noviembre</th> (no h2) → read", () => {
      const page = `<table><tr><th>Noviembre</th></tr>
<tr><td>18</td><td>41.357,30</td></tr></table>`;
      expect(extractUFFromSII(page, '11', 18)).toBe(41357.3);
    });
  });

  describe('send-back 2: the reader ignores HTML comments and refuses an oversized page', () => {
    it('the fixture holds 8 comments, all closed, and is still read', () => {
      expect(REAL_PAGE.split('<!--').length - 1).toBe(8);
      expect(REAL_PAGE.split('-->').length - 1).toBe(8);
      expect(extractUFFromSII(REAL_PAGE, '11', 18)).toBe(41357.3);
    });

    it('a commented-out heading row is not the first row (the page of the second reading, exactly as written) → null', () => {
      const page = `<table>\n<!-- <tr><th>Noviembre</th></tr> -->\n<tr><th>Octubre</th></tr>\n<tr><td>18</td><td>41.178,64</td></tr>\n</table>`;
      expect(extractUFFromSII(page, '11', 18)).toBeNull();
    });

    it('a real heading row, then a commented-out day row with another value, then the real day row → the real value', () => {
      const page = `<table><tr><th colspan='6'><h2>Noviembre</h2></th></tr>
<!-- <tr><td>18</td><td>40.000,00</td></tr> -->
<tr><td>18</td><td>41.357,30</td></tr></table>`;
      expect(extractUFFromSII(page, '11', 18)).toBe(41357.3);
    });

    it('a comment between the day cell and its value cell → the value is still read', () => {
      const page = `<table><tr><th colspan='6'><h2>Noviembre</h2></th></tr>
<tr><th width='40'><strong>18</strong></th> <!-- <td></td> --> <td width='200'>41.357,30</td></tr></table>`;
      expect(extractUFFromSII(page, '11', 18)).toBe(41357.3);
    });

    it("an unclosed <!-- before the month's table → null (everything after it is removed)", () => {
      const page = `<!-- unclosed
<table><tr><th colspan='6'><h2>Noviembre</h2></th></tr>
<tr><td>18</td><td>41.357,30</td></tr></table>`;
      expect(extractUFFromSII(page, '11', 18)).toBeNull();
    });

    it('a page of 500,001 characters that otherwise holds a readable November table → null', () => {
      const table = `<table><tr><th colspan='6'><h2>Noviembre</h2></th></tr>
<tr><td>18</td><td>41.357,30</td></tr></table>`;
      expect(extractUFFromSII(table, '11', 18)).toBe(41357.3);
      const page = table + ' '.repeat(500_001 - table.length);
      expect(page.length).toBe(500_001);
      expect(extractUFFromSII(page, '11', 18)).toBeNull();
      // Exactly the limit is still read.
      expect(extractUFFromSII(page.slice(0, 500_000), '11', 18)).toBe(41357.3);
    });
  });
});
