/**
 * F21b send-back 2 (GES-3.11): a client is found by RUT however the stored value
 * is written. rutSpellings gives the three usual spellings of one RUT, each with
 * the check letter in both cases when it is a K. Synthetic RUTs only.
 */
import { describe, it, expect } from 'vitest';
import { rutSpellings } from '../../../lib/contracts/rut-spellings';

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
