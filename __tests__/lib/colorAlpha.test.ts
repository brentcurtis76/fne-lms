// @vitest-environment node
/**
 * `withAlpha` replaces the old gluing of two hex characters onto a colour string (`${color}20`).
 * For a hex colour (the brand kit's stay hex) it must produce exactly what the gluing produced; for a
 * named value it must give the same opacity, written so it rounds back to the same 8-bit value.
 */
import { alphaFromHex, withAlpha } from '../../lib/colorAlpha';

// Every pair of characters the platform's code glues through the helper today.
const PAIRS_IN_USE: ReadonlyArray<readonly [string, string]> = [
  ['20', '0.1255'],
  ['30', '0.1882'],
];

describe('withAlpha', () => {
  it.each(PAIRS_IN_USE)('turns "%s" into the opacity %s, which rounds back to the same 8-bit value', (hh, alpha) => {
    expect(alphaFromHex(hh)).toBe(alpha);
    expect(Math.round(Number(alpha) * 255)).toBe(parseInt(hh, 16));
  });

  it.each(PAIRS_IN_USE)('appends "%s" to a hex colour exactly as the gluing did', (hh) => {
    for (const hex of ['#0a0a0a', '#fbbf24', '#f59e0b', '#1f1f1f', '#6b7280', '#ABCDEF']) {
      expect(withAlpha(hex, hh)).toBe(`${hex}${hh}`);
    }
  });

  it.each(PAIRS_IN_USE)('puts the opacity for "%s" inside a named value', (hh, alpha) => {
    expect(withAlpha('rgb(var(--color-legacy-10b981))', hh)).toBe(`rgb(var(--color-legacy-10b981) / ${alpha})`);
    expect(withAlpha('rgb(var(--color-blue-500))', hh)).toBe(`rgb(var(--color-blue-500) / ${alpha})`);
  });

  it.each(PAIRS_IN_USE)('puts the opacity for "%s" inside a named value with a fallback (5a chart series)', (hh, alpha) => {
    expect(withAlpha('rgb(var(--color-serie-1, var(--color-legacy-10b981)))', hh)).toBe(
      `rgb(var(--color-serie-1, var(--color-legacy-10b981)) / ${alpha})`
    );
    expect(withAlpha('rgb(var(--color-serie-2, 251 191 36))', hh)).toBe(`rgb(var(--color-serie-2, 251 191 36) / ${alpha})`);
  });

  it('turns "80" into 0.502 for the series of the new look (it used to be glued onto a brand hex)', () => {
    expect(withAlpha('rgb(var(--color-serie-1, 10 10 10))', '80')).toBe('rgb(var(--color-serie-1, 10 10 10) / 0.502)');
    expect(Math.round(0.502 * 255)).toBe(0x80);
  });

  it('leaves anything else as the gluing did, as before', () => {
    expect(withAlpha('rgb(10 10 10)', '20')).toBe('rgb(10 10 10)20');
    expect(withAlpha('rgb(var(--a, red))', '20')).toBe('rgb(var(--a, red))20');
  });

  it('rounds back to the same 8-bit value for every pair of hex characters', () => {
    for (let n = 0; n < 256; n += 1) {
      const hh = n.toString(16).padStart(2, '0');
      expect(Math.round(Number(alphaFromHex(hh)) * 255)).toBe(n);
    }
    expect(alphaFromHex('00')).toBe('0');
    expect(alphaFromHex('ff')).toBe('1');
    expect(alphaFromHex('FF')).toBe('1');
  });

  it('refuses anything that is not two hex characters', () => {
    expect(() => withAlpha('#0a0a0a', '2')).toThrow();
    expect(() => withAlpha('#0a0a0a', 'zz')).toThrow();
    expect(() => withAlpha('#0a0a0a', '200')).toThrow();
  });
});
