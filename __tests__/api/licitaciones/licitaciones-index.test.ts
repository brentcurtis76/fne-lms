// @vitest-environment node

/**
 * Task-specific tests for pages/api/licitaciones/index.ts
 * Tests the Zod schema validation and role-check logic for the licitaciones API.
 * Uses synthetic data only — no real school names or user data.
 */

import { describe, it, expect } from 'vitest';
import { CreateLicitacionSchema, LicitacionFiltersSchema } from '../../../types/licitaciones';

// -------------------------------------------------------
// POST body validation via CreateLicitacionSchema
// -------------------------------------------------------

describe('POST /api/licitaciones — body validation (CreateLicitacionSchema)', () => {
  const validBody = {
    school_id: 42,
    programa_id: 'prog-test-001',
    nombre_licitacion: 'Licitacion ATE Test 2026',
    email_licitacion: 'lic.test@escuela-sintetica.cl',
    monto_minimo: 10,
    monto_maximo: 100,
    tipo_moneda: 'UF',
    duracion_minima: '6 meses',
    duracion_maxima: '12 meses',
    peso_evaluacion_tecnica: 70,
    year: 2026,
  };

  it('accepts a valid creation payload', () => {
    const result = CreateLicitacionSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('rejects when school_id is missing', () => {
    const { school_id: _, ...body } = validBody;
    const result = CreateLicitacionSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('rejects when programa_id is empty string', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, programa_id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when email_licitacion is not valid email', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, email_licitacion: 'bad-email' });
    expect(result.success).toBe(false);
  });

  it('rejects when monto_maximo < monto_minimo', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validBody,
      monto_minimo: 200,
      monto_maximo: 100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map(e => e.path[0]);
      expect(paths).toContain('monto_maximo');
    }
  });

  it('accepts monto_maximo equal to monto_minimo (boundary)', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validBody,
      monto_minimo: 50,
      monto_maximo: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects peso_evaluacion_tecnica of 0', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, peso_evaluacion_tecnica: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects peso_evaluacion_tecnica of 100', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, peso_evaluacion_tecnica: 100 });
    expect(result.success).toBe(false);
  });

  it('accepts peso_evaluacion_tecnica at boundary values 1 and 99', () => {
    expect(CreateLicitacionSchema.safeParse({ ...validBody, peso_evaluacion_tecnica: 1 }).success).toBe(true);
    expect(CreateLicitacionSchema.safeParse({ ...validBody, peso_evaluacion_tecnica: 99 }).success).toBe(true);
  });

  it('coerces school_id from string "42" to number 42', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, school_id: '42' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.school_id).toBe(42);
    }
  });

  it('defaults tipo_moneda to UF when omitted', () => {
    const { tipo_moneda: _, ...bodyWithout } = validBody;
    const result = CreateLicitacionSchema.safeParse(bodyWithout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo_moneda).toBe('UF');
    }
  });

  it('accepts optional fields as null', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validBody,
      participantes_estimados: null,
      modalidad_preferida: null,
      notas: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects year < 2024', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, year: 2020 });
    expect(result.success).toBe(false);
  });

  it('rejects year > 2030', () => {
    const result = CreateLicitacionSchema.safeParse({ ...validBody, year: 2035 });
    expect(result.success).toBe(false);
  });
});

// -------------------------------------------------------
// GET filter params validation via LicitacionFiltersSchema
// -------------------------------------------------------

describe('GET /api/licitaciones — filter params (LicitacionFiltersSchema)', () => {
  it('accepts empty query (all defaults)', () => {
    const result = LicitacionFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts valid year filter', () => {
    const result = LicitacionFiltersSchema.safeParse({ year: '2026' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2026);
    }
  });

  it('accepts valid estado filter', () => {
    const result = LicitacionFiltersSchema.safeParse({ estado: 'publicacion_pendiente' });
    expect(result.success).toBe(true);
  });

  it('accepts school_id as string (coerced to number)', () => {
    const result = LicitacionFiltersSchema.safeParse({ school_id: '5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.school_id).toBe(5);
    }
  });

  it('rejects limit > 50', () => {
    const result = LicitacionFiltersSchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });

  it('rejects page < 1', () => {
    const result = LicitacionFiltersSchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });
});
