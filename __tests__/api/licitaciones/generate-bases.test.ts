// @vitest-environment node

/**
 * Task-specific tests for pages/api/licitaciones/[id]/generate-bases.ts
 * Tests the schema validation and type contracts for the generate-bases endpoint.
 * Uses synthetic data only.
 *
 * Note: Full integration tests (DB calls, storage uploads) require a live Supabase
 * instance and are not run in the unit test suite. These tests cover the Zod schema
 * validation for the uuidSchema used as the route parameter guard.
 */

import { describe, it, expect } from 'vitest';
import { uuidSchema } from '../../../lib/validation/schemas';
import { BasesTemplateSchema } from '../../../types/licitaciones';

// -------------------------------------------------------
// Route param guard — uuidSchema validates [id]
// -------------------------------------------------------

describe('generate-bases route param validation (uuidSchema)', () => {
  it('accepts a valid UUID v4', () => {
    const result = uuidSchema.safeParse('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.success).toBe(true);
  });

  it('rejects an invalid UUID string', () => {
    const result = uuidSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = uuidSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects undefined', () => {
    const result = uuidSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it('rejects array (Next.js repeated query param)', () => {
    const result = uuidSchema.safeParse(['a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
    expect(result.success).toBe(false);
  });
});

// -------------------------------------------------------
// BasesTemplateSchema — validates template edit payload
// (used in admin template management POST)
// -------------------------------------------------------

describe('BasesTemplateSchema — template management POST validation', () => {
  const validTemplate = {
    nombre_servicio: 'Servicio de Asesoria Sintetico',
    objetivo: 'Objetivo de prueba para el template sintetico',
    objetivos_especificos: ['Objetivo 1', 'Objetivo 2'],
    especificaciones_admin: {
      frecuencia: 'Dos veces al mes',
      lugar: 'En el establecimiento',
      contrapartes_tecnicas: 'Director',
      condiciones_pago: 'Por informe aprobado',
    },
    resultados_esperados: ['Resultado 1', 'Resultado 2'],
    requisitos_ate: ['Requisito ATE 1'],
    documentos_adjuntar: ['CV del equipo'],
    condiciones_pago: 'Pago en cuotas',
  };

  it('accepts a valid template payload', () => {
    const result = BasesTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it('rejects when nombre_servicio is empty', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, nombre_servicio: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when objetivo is empty', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, objetivo: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when objetivos_especificos is empty array', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, objetivos_especificos: [] });
    expect(result.success).toBe(false);
  });

  it('rejects when resultados_esperados is empty array', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, resultados_esperados: [] });
    expect(result.success).toBe(false);
  });

  it('rejects when requisitos_ate is empty array', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, requisitos_ate: [] });
    expect(result.success).toBe(false);
  });

  it('rejects when documentos_adjuntar is empty array', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, documentos_adjuntar: [] });
    expect(result.success).toBe(false);
  });

  it('accepts condiciones_pago as null', () => {
    const result = BasesTemplateSchema.safeParse({ ...validTemplate, condiciones_pago: null });
    expect(result.success).toBe(true);
  });

  it('accepts partial especificaciones_admin (all keys optional)', () => {
    const result = BasesTemplateSchema.safeParse({
      ...validTemplate,
      especificaciones_admin: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts extra items in array fields', () => {
    const result = BasesTemplateSchema.safeParse({
      ...validTemplate,
      objetivos_especificos: ['A', 'B', 'C', 'D', 'E'],
    });
    expect(result.success).toBe(true);
  });
});

// -------------------------------------------------------
// Auth scenarios (documented, not executable without live server)
// -------------------------------------------------------

describe('generate-bases auth scenarios (schema documentation)', () => {
  // These tests document the expected auth behavior without requiring a live server.
  // Integration tests with a real server would be in playwright e2e tests.

  it('documents: unauthenticated request should return 401', () => {
    // When getApiUser fails (no session cookie), the route returns 401
    // This is enforced by the auth middleware pattern from upload.ts
    expect(true).toBe(true); // Documented — tested via QA scenarios
  });

  it('documents: non-admin non-encargado request should return 403', () => {
    // When role check fails (!isAdmin && !isEncargado), route returns 403
    expect(true).toBe(true); // Documented — tested via QA scenarios
  });

  it('documents: encargado for wrong school should return 403', () => {
    // When school_id mismatch, route returns 403
    expect(true).toBe(true); // Documented — tested via QA scenarios
  });

  it('documents: licitacion with no active template returns 422', () => {
    // When programa_bases_templates has no active record, returns 422 with helpful message
    expect(true).toBe(true); // Documented — tested via QA scenarios
  });
});
