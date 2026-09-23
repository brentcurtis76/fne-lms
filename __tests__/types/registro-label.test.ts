import { describe, it, expect } from 'vitest';
import { getRegistroLabel, TransformationArea } from '@/types/assessment-builder';

describe('getRegistroLabel', () => {
  it('names teacher-facing instruments as registros of their vía', () => {
    expect(getRegistroLabel('personalizacion')).toBe('Registro de Crecimiento');
    expect(getRegistroLabel('aprendizaje')).toBe('Registro de Aprendizaje');
    expect(getRegistroLabel('personalizacion', true)).toBe('Registros de Crecimiento');
  });

  it('covers every vía without mentioning Evaluaciones as a noun', () => {
    const areas: TransformationArea[] = [
      'aprendizaje', 'personalizacion', 'evaluacion', 'proposito', 'familias', 'trabajo_docente', 'liderazgo',
    ];
    for (const area of areas) {
      expect(getRegistroLabel(area)).toMatch(/^Registro de /);
    }
  });

  it('falls back to the bare noun for unknown or missing areas', () => {
    expect(getRegistroLabel(undefined)).toBe('Registro');
    expect(getRegistroLabel('desconocida', true)).toBe('Registros');
  });
});
