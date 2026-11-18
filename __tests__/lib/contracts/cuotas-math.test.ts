import { describe, it, expect } from 'vitest';
import { splitEvenly, sumsMatch, difference, decimalsFor } from '../../../lib/contracts/cuotas-math';

/**
 * F10b (GES-2.7): «Calcular Automático» splits a contract total into cuotas
 * that add up exactly (whole hundredths for UF, whole pesos for CLP; the last
 * cuota takes the remainder), and the step-3 check compares whole units.
 */
const sumUnits = (parts: number[], decimals: number) =>
  parts.reduce((s, p) => s + Math.round(p * 10 ** decimals), 0);

describe('splitEvenly', () => {
  it('100 UF in 3 → 33.33, 33.33, 33.34', () => {
    expect(splitEvenly(100, 3, 2)).toEqual([33.33, 33.33, 33.34]);
  });

  it('1.000.000 CLP in 3 → 333333, 333333, 333334', () => {
    expect(splitEvenly(1000000, 3, 0)).toEqual([333333, 333333, 333334]);
  });

  it('0.05 UF in 12 → eleven zeros and 0.05 last', () => {
    const parts = splitEvenly(0.05, 12, 2);
    expect(parts).toHaveLength(12);
    expect(parts.slice(0, 11)).toEqual(Array(11).fill(0));
    expect(parts[11]).toBe(0.05);
    expect(sumUnits(parts, 2)).toBe(5);
  });

  it('100.01 UF in 7 → six × 14.28 and 14.33', () => {
    const parts = splitEvenly(100.01, 7, 2);
    expect(parts).toEqual([14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.33]);
    expect(sumUnits(parts, 2)).toBe(10001);
  });

  it('n = 1 → the whole total', () => {
    expect(splitEvenly(123.45, 1, 2)).toEqual([123.45]);
    expect(splitEvenly(999, 1, 0)).toEqual([999]);
  });

  it('the parts always add up to the total exactly', () => {
    for (const total of [1, 7.77, 99.99, 100, 1234.56, 0.01]) {
      for (let n = 1; n <= 12; n++) {
        const parts = splitEvenly(total, n, 2);
        expect(parts).toHaveLength(n);
        expect(sumUnits(parts, 2)).toBe(Math.round(total * 100));
        expect(sumsMatch(total, parts, 2)).toBe(true);
        // every cuota the same except the last
        expect(new Set(parts.slice(0, -1)).size).toBeLessThanOrEqual(1);
      }
    }
    for (const total of [1, 1000, 999999, 2400000]) {
      for (let n = 1; n <= 12; n++) {
        const parts = splitEvenly(total, n, 0);
        expect(parts.every((p) => Number.isInteger(p))).toBe(true);
        expect(sumUnits(parts, 0)).toBe(total);
      }
    }
  });
});

describe('sumsMatch', () => {
  it('compares whole units without floating-point tolerance', () => {
    // 33.33 × 3 = 99.99 (floating point gives |99.99 − 100| slightly above 0.01)
    expect(sumsMatch(100, [33.33, 33.33, 33.33], 2)).toBe(false);
    expect(sumsMatch(100, [33.33, 33.33, 33.34], 2)).toBe(true);
    expect(sumsMatch(0.3, [0.1, 0.2], 2)).toBe(true);
    expect(sumsMatch(1000000, [333333, 333333, 333334], 0)).toBe(true);
    expect(sumsMatch(1000000, [333333, 333333, 333333], 0)).toBe(false);
  });
});

describe('difference', () => {
  it('gives total minus the sum, in the currency’s units', () => {
    expect(difference(100, [33.33, 33.33, 33.33], 2)).toBe(0.01);
    expect(difference(100, [50, 60], 2)).toBe(-10);
    expect(difference(1000000, [333333, 333333, 333333], 0)).toBe(1);
    expect(difference(100, [33.33, 33.33, 33.34], 2)).toBe(0);
  });
});

describe('decimalsFor', () => {
  it('UF has two decimals, CLP none', () => {
    expect(decimalsFor('UF')).toBe(2);
    expect(decimalsFor('CLP')).toBe(0);
  });
});
