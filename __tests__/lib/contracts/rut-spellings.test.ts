/**
 * F21b send-back 2 (GES-3.11): a client is found by RUT however the stored value
 * is written. rutSpellings gives the three usual spellings of one RUT, each with
 * the check letter in both cases when it is a K. Synthetic RUTs only.
 */
import { describe, it, expect } from 'vitest';
import { rutSpellings, oldestClient } from '../../../lib/contracts/rut-spellings';

describe('rutSpellings', () => {
  it.each(['76.123.456-0', '76123456-0', '761234560', ' 76.123.456-0 '])('«%s» → formatted, without dots, bare', (rut) => {
    expect(rutSpellings(rut)).toEqual(['76.123.456-0', '76123456-0', '761234560']);
  });

  it('a K check letter is asked for in both cases', () => {
    const list = rutSpellings('12.345.678-K');
    expect(list).toEqual([
      '12.345.678-K', '12345678-K', '12345678K',
      '12.345.678-k', '12345678-k', '12345678k',
    ]);
    expect(rutSpellings('12345678k')).toEqual(list);
  });

  it('nothing to look for: an empty list', () => {
    expect(rutSpellings('')).toEqual([]);
    expect(rutSpellings('-')).toEqual([]);
  });
});

// Send-back 3: "the oldest row" is the same everywhere.
describe('oldestClient', () => {
  const A = { id: 'a-id', nombre_legal: 'Zeta', created_at: '2026-01-01T00:00:00Z' };
  const B = { id: 'b-id', nombre_legal: 'Alfa', created_at: '2026-02-01T00:00:00Z' };
  it('takes the earliest created_at, whatever the order given', () => {
    expect(oldestClient([B, A])).toBe(A);
    expect(oldestClient([A, B])).toBe(A);
  });
  it('equal created_at: the smaller id, every time', () => {
    const X = { id: 'x-1', created_at: '2026-01-01T00:00:00Z' };
    const Y = { id: 'y-2', created_at: '2026-01-01T00:00:00Z' };
    expect(oldestClient([Y, X])).toBe(X);
    expect(oldestClient([X, Y])).toBe(X);
  });
  it('a row without created_at comes after the dated ones (as NULLS LAST)', () => {
    const N = { id: '0-first-by-id', created_at: null };
    expect(oldestClient([N, B])).toBe(B);
  });
  it('none: null', () => {
    expect(oldestClient([])).toBeNull();
    expect(oldestClient(null)).toBeNull();
  });
});

