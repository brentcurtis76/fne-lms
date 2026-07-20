import { describe, it, expect } from 'vitest';
import { validateProfundidadDescriptors } from '../../../lib/validation/profundidadValidator';

describe('validateProfundidadDescriptors', () => {
  it('accepts at least one non-empty descriptor', () => {
    expect(validateProfundidadDescriptors(['algo', null, null, null, null]).valid).toBe(true);
    expect(validateProfundidadDescriptors([null, null, null, null, 'nivel 4']).valid).toBe(true);
  });

  it('rejects when all descriptors are empty', () => {
    const result = validateProfundidadDescriptors([null, null, null, null, null]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Los indicadores de profundidad requieren al menos un descriptor de nivel');
  });

  it('treats whitespace-only strings as empty', () => {
    expect(validateProfundidadDescriptors(['', '   ', '\t', null, undefined]).valid).toBe(false);
  });

  it('treats non-string values as empty', () => {
    expect(validateProfundidadDescriptors([123, {}, [], true, null] as unknown[]).valid).toBe(false);
  });
});
