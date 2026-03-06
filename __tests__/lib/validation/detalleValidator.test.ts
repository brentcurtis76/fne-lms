// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateDetalleOptions } from '../../../lib/validation/detalleValidator';

describe('validateDetalleOptions', () => {
  it('accepts valid options (2+ trimmed, unique strings)', () => {
    const result = validateDetalleOptions(['ABP', 'Gamificación', 'Trabajo colaborativo']);
    expect(result.valid).toBe(true);
    expect(result.options).toEqual(['ABP', 'Gamificación', 'Trabajo colaborativo']);
    expect(result.error).toBeUndefined();
  });

  it('trims whitespace from options', () => {
    const result = validateDetalleOptions(['  ABP  ', '  Gamificación  ']);
    expect(result.valid).toBe(true);
    expect(result.options).toEqual(['ABP', 'Gamificación']);
  });

  it('rejects non-array input', () => {
    const result = validateDetalleOptions('not an array');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('arreglo');
  });

  it('rejects fewer than 2 options', () => {
    const result = validateDetalleOptions(['Solo una']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2');
  });

  it('rejects more than 15 options', () => {
    const tooMany = Array.from({ length: 16 }, (_, i) => `Opción ${i + 1}`);
    const result = validateDetalleOptions(tooMany);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('15');
  });

  it('rejects non-string elements', () => {
    const result = validateDetalleOptions(['ABP', 123]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('texto');
  });

  it('rejects empty-string options', () => {
    const result = validateDetalleOptions(['ABP', '  ']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('contenido');
  });

  it('rejects options longer than 200 characters', () => {
    const long = 'x'.repeat(201);
    const result = validateDetalleOptions(['ABP', long]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('200');
  });

  it('rejects options with HTML tags', () => {
    const result = validateDetalleOptions(['ABP', '<script>alert("xss")</script>']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTML');
  });

  it('rejects options with self-closing HTML tags', () => {
    const result = validateDetalleOptions(['ABP', '<img src=x onerror=alert(1)>']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTML');
  });

  it('rejects options with control characters', () => {
    const result = validateDetalleOptions(['ABP', 'text\x00with\x01control']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('inválidos');
  });

  it('rejects case-insensitive duplicate options', () => {
    const result = validateDetalleOptions(['ABP', 'abp']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('repetirse');
  });

  it('accepts exactly 2 options (minimum)', () => {
    const result = validateDetalleOptions(['A', 'B']);
    expect(result.valid).toBe(true);
    expect(result.options).toHaveLength(2);
  });

  it('accepts exactly 15 options (maximum)', () => {
    const maxOptions = Array.from({ length: 15 }, (_, i) => `Opción ${i + 1}`);
    const result = validateDetalleOptions(maxOptions);
    expect(result.valid).toBe(true);
    expect(result.options).toHaveLength(15);
  });
});
