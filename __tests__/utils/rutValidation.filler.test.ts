// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isFillerRut, validateRut } from '@/utils/rutValidation';

// F22e, E1: the filler RUT 11.111.111-1 is recognised in every spelling.
describe('isFillerRut', () => {
  it.each(['11.111.111-1', '11111111-1', '111111111', ' 11.111.111-1 '])(
    'is true for the filler spelled %j',
    (value) => {
      expect(isFillerRut(value)).toBe(true);
    },
  );

  it('is false for a real valid RUT', () => {
    expect(validateRut('12.345.678-5')).toBe(true);
    expect(isFillerRut('12.345.678-5')).toBe(false);
  });

  it('is false for empty, null and undefined', () => {
    expect(isFillerRut('')).toBe(false);
    expect(isFillerRut(null)).toBe(false);
    expect(isFillerRut(undefined)).toBe(false);
  });

  it('is false for 11.111.111-K', () => {
    expect(isFillerRut('11.111.111-K')).toBe(false);
  });

  it('leaves validateRut unchanged (the filler still has a valid check digit)', () => {
    expect(validateRut('11.111.111-1')).toBe(true);
  });
});
