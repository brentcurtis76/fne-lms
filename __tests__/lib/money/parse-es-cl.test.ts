/**
 * F21b (N171): amounts typed the Chilean way are read by one helper.
 * Dots are thousands separators and a comma is the decimal mark; a single dot
 * followed by one or two digits is a decimal mark only where decimals are allowed.
 */
import { describe, it, expect } from 'vitest';
import { parseEsCl } from '../../../lib/money/parse-es-cl';

describe('parseEsCl', () => {
  it.each([
    ['1.200,50', 2, 1200.5],
    ['15.990', 2, 15990],
    ['15.990', 0, 15990],
    ['100.01', 2, 100.01],
    ['100.5', 2, 100.5],
    ['0', 2, 0],
    ['0', 0, 0],
    [' 1.200,50 ', 2, 1200.5],
    ['$15.990', 0, 15990],
    ['UF 100,5', 2, 100.5],
    ['1200', 0, 1200],
    ['1.000.000', 0, 1000000],
    ['33,33', 2, 33.33],
  ] as const)('reads «%s» (decimals %d) as %d', (text, decimals, expected) => {
    expect(parseEsCl(text, { decimals })).toBe(expected);
  });

  it.each([
    ['', 2],
    ['abc', 2],
    ['1,2,3', 2],
    ['1.2.3,4', 2],
    ['-5', 2],
    ['-5', 0],
    ['   ', 2],
    ['1.2.3', 2],
  ] as const)('refuses «%s» (decimals %d)', (text, decimals) => {
    expect(parseEsCl(text, { decimals })).toBeNull();
  });

  it('pesos (decimals 0) refuse any decimal part', () => {
    expect(parseEsCl('100,5', { decimals: 0 })).toBeNull();
    expect(parseEsCl('100.5', { decimals: 0 })).toBeNull();
    expect(parseEsCl('100.01', { decimals: 0 })).toBeNull();
    expect(parseEsCl('1.200,50', { decimals: 0 })).toBeNull();
  });

  it('refuses more decimals than the field allows', () => {
    expect(parseEsCl('49,995', { decimals: 2 })).toBeNull();
    expect(parseEsCl('49,995', { decimals: 3 })).toBe(49.995);
  });

  it('a dot followed by exactly three digits is always thousands', () => {
    expect(parseEsCl('49.995', { decimals: 2 })).toBe(49995);
  });
});
