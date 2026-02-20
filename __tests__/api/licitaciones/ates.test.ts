// @vitest-environment node

/**
 * Task-specific tests for pages/api/licitaciones/[id]/ates.ts
 * Tests the Zod schema validation and business logic for ATE CRUD.
 * Uses synthetic data only — no real organization names or user data.
 */

import { describe, it, expect } from 'vitest';
import { CreateAteSchema, UpdateAteSchema } from '../../../types/licitaciones';
import { validateRut, formatRut } from '../../../utils/rutValidation';

// -------------------------------------------------------
// CreateAteSchema — POST body validation
// -------------------------------------------------------

describe('POST /api/licitaciones/[id]/ates — CreateAteSchema validation', () => {
  const validBody = {
    nombre_ate: 'ATE Prueba Sintetica SPA',
    rut_ate: '12.345.678-5',
    nombre_contacto: 'Juan Perez Sintetico',
    email: 'contacto@ate-sintetica.cl',
    telefono: '+56912345678',
    fecha_solicitud_bases: '2026-03-15',
  };

  it('accepts a valid ATE creation payload', () => {
    const result = CreateAteSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('rejects when nombre_ate is missing', () => {
    const { nombre_ate: _, ...body } = validBody;
    const result = CreateAteSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('rejects when nombre_ate is empty string', () => {
    const result = CreateAteSchema.safeParse({ ...validBody, nombre_ate: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when email is invalid format', () => {
    const result = CreateAteSchema.safeParse({ ...validBody, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('accepts when all optional fields are null', () => {
    const result = CreateAteSchema.safeParse({
      nombre_ate: 'ATE Solo Nombre',
      rut_ate: null,
      nombre_contacto: null,
      email: null,
      telefono: null,
      fecha_solicitud_bases: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts when only nombre_ate is provided (all others omitted)', () => {
    const result = CreateAteSchema.safeParse({ nombre_ate: 'ATE Minima Sintetica' });
    expect(result.success).toBe(true);
  });

  it('rejects fecha_solicitud_bases in wrong format', () => {
    const result = CreateAteSchema.safeParse({
      ...validBody,
      fecha_solicitud_bases: '15/03/2026',
    });
    expect(result.success).toBe(false);
  });

  it('accepts fecha_solicitud_bases in YYYY-MM-DD format', () => {
    const result = CreateAteSchema.safeParse({
      ...validBody,
      fecha_solicitud_bases: '2026-03-15',
    });
    expect(result.success).toBe(true);
  });
});

// -------------------------------------------------------
// UpdateAteSchema — PUT body validation
// -------------------------------------------------------

describe('PUT /api/licitaciones/[id]/ates — UpdateAteSchema validation', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = UpdateAteSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial update with only fecha_envio_bases', () => {
    const result = UpdateAteSchema.safeParse({ fecha_envio_bases: '2026-03-20' });
    expect(result.success).toBe(true);
  });

  it('rejects fecha_envio_bases in wrong format', () => {
    const result = UpdateAteSchema.safeParse({ fecha_envio_bases: '20-03-2026' });
    expect(result.success).toBe(false);
  });

  it('accepts notas up to 2000 chars', () => {
    const result = UpdateAteSchema.safeParse({ notas: 'A'.repeat(2000) });
    expect(result.success).toBe(true);
  });

  it('rejects notas over 2000 chars', () => {
    const result = UpdateAteSchema.safeParse({ notas: 'A'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});

// -------------------------------------------------------
// RUT Validation — used in ATE API route
// -------------------------------------------------------

describe('RUT validation for ATE registration', () => {
  it('validates a known valid RUT (12.345.678-5)', () => {
    expect(validateRut('12.345.678-5')).toBe(true);
  });

  it('validates a valid RUT without formatting (123456785)', () => {
    expect(validateRut('123456785')).toBe(true);
  });

  it('rejects the known-invalid all-same-digit RUT (11.111.111-1)', () => {
    // 11111111 with verifier 1 — let's verify via calculation
    // This is used as a common test for invalid RUTs in Chile
    expect(validateRut('11111111-1')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateRut('')).toBe(false);
  });

  it('rejects a RUT that is too short', () => {
    expect(validateRut('1')).toBe(false);
  });

  it('formats a RUT correctly', () => {
    const formatted = formatRut('123456785');
    expect(formatted).toBe('12.345.678-5');
  });

  it('rejects a RUT with wrong verifier digit', () => {
    // 12.345.678 has verifier 5; using 6 should fail
    expect(validateRut('12.345.678-6')).toBe(false);
  });
});

// -------------------------------------------------------
// State transition — AdvanceStateSchema
// -------------------------------------------------------

import { AdvanceStateSchema } from '../../../types/licitaciones';

describe('POST /api/licitaciones/[id]/advance — AdvanceStateSchema validation', () => {
  it('accepts target_estado propuestas_pendientes', () => {
    const result = AdvanceStateSchema.safeParse({ target_estado: 'propuestas_pendientes' });
    expect(result.success).toBe(true);
  });

  it('accepts target_estado evaluacion_pendiente', () => {
    const result = AdvanceStateSchema.safeParse({ target_estado: 'evaluacion_pendiente' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown target_estado', () => {
    const result = AdvanceStateSchema.safeParse({ target_estado: 'cerrada' });
    expect(result.success).toBe(false);
  });

  it('rejects empty target_estado', () => {
    const result = AdvanceStateSchema.safeParse({ target_estado: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing target_estado', () => {
    const result = AdvanceStateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// -------------------------------------------------------
// CreateConsultaSchema
// -------------------------------------------------------

import { CreateConsultaSchema } from '../../../types/licitaciones';

describe('POST /api/licitaciones/[id]/consultas — CreateConsultaSchema validation', () => {
  it('accepts a valid consulta with all fields', () => {
    const result = CreateConsultaSchema.safeParse({
      pregunta: 'Cual es la modalidad de las sesiones?',
      respuesta: 'Las sesiones seran presenciales',
      fecha_pregunta: '2026-03-15',
      fecha_respuesta: '2026-03-16',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when pregunta is empty', () => {
    const result = CreateConsultaSchema.safeParse({ pregunta: '' });
    expect(result.success).toBe(false);
  });

  it('rejects when pregunta is missing', () => {
    const result = CreateConsultaSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts when optional fields are null', () => {
    const result = CreateConsultaSchema.safeParse({
      pregunta: 'Solo pregunta sin respuesta todavia',
      respuesta: null,
      fecha_pregunta: null,
      fecha_respuesta: null,
      ate_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid ate_id UUID', () => {
    const result = CreateConsultaSchema.safeParse({
      pregunta: 'Test?',
      ate_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid ate_id UUID', () => {
    const result = CreateConsultaSchema.safeParse({
      pregunta: 'Test con ATE?',
      ate_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(result.success).toBe(true);
  });
});
