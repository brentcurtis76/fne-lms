// @vitest-environment node
/**
 * FIRST-B4 / I02 — the strict RUT wrapper. Synthetic RUTs only; each check
 * digit below was computed with the modulo-11 rule the RPC also applies.
 */
import { describe, expect, it } from 'vitest';
import { displayRut, normalizeStrictRut } from '../../../../lib/pasantias/participants/rut';
import { validateRut } from '../../../../utils/rutValidation';

describe('normalizeStrictRut', () => {
  it.each([
    ['12345678-5', '12345678-5'],
    ['12.345.678-5', '12345678-5'],
    [' 12 345 678 - 5 ', '12345678-5'],
    ['123456785', '12345678-5'],
    ['10.000.030-K', '10000030-K'],
    ['10000030-k', '10000030-K'],
    ['10000004-0', '10000004-0'],
    ['1.000.000-9', '1000000-9'],
    ['11111111-1', '11111111-1'],
  ])('accepts %j as %j', (input, stored) => {
    expect(normalizeStrictRut(input)).toBe(stored);
  });

  it.each([
    ['letters inside the number', '1x2.3a45.678-5'],
    ['0-0', '0-0'],
    ['a body under 1.000.000', '999.999-1'],
    ['more than 8 body digits', '123456789-2'],
    ['a leading zero', '01234567-5'],
    ['a wrong check digit', '12345678-6'],
    ['empty input', ''],
    ['whitespace only', '   '],
    ['K inside the body', '1K000030-K'],
    ['two hyphens', '12-345678-5'],
    ['a hyphen not before the check digit', '1234567-85'],
    ['a non-string', 12345678],
  ])('rejects %s', (_label, input) => {
    expect(normalizeStrictRut(input)).toBeNull();
  });

  it('is stricter than the shared validator on exactly the cases FIRST-B4 names', () => {
    // The shared helper strips letters and accepts these; the wrapper must not.
    expect(validateRut('1x2.3a45.678-5')).toBe(true);
    expect(normalizeStrictRut('1x2.3a45.678-5')).toBeNull();
  });
});

describe('displayRut', () => {
  it('formats the stored form with dots', () => {
    expect(displayRut('12345678-5')).toBe('12.345.678-5');
    expect(displayRut('10000030-K')).toBe('10.000.030-K');
    expect(displayRut('1000000-9')).toBe('1.000.000-9');
  });
});
