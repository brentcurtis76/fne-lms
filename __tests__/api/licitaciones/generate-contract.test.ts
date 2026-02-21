// @vitest-environment node

/**
 * Task-specific tests for Phase 5 API routes and schema validation.
 * Tests cover:
 * - GenerateContractSchema (request body validation)
 * - CloseLicitacionSchema (request body validation)
 * - FeriadoSchema (holiday CRUD request body validation)
 * - UpdateFeriadoSchema (holiday update body validation)
 *
 * All tests are pure schema tests — no real DB or HTTP connections.
 * Synthetic data only.
 */

import { describe, it, expect } from 'vitest';
import {
  GenerateContractSchema,
  CloseLicitacionSchema,
  FeriadoSchema,
  UpdateFeriadoSchema,
} from '../../../types/licitaciones';

// ============================================================
// generate-contract API — input validation
// ============================================================

describe('POST /api/licitaciones/[id]/generate-contract — body validation', () => {
  it('accepts valid UUID contrato_id', () => {
    const body = { contrato_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    const result = GenerateContractSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contrato_id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    }
  });

  it('rejects missing contrato_id', () => {
    const result = GenerateContractSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID contrato_id', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: 'not-a-uuid-string' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toMatch(/UUID/i);
  });

  it('rejects numeric contrato_id', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: 12345 });
    expect(result.success).toBe(false);
  });

  it('rejects null contrato_id', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: null });
    expect(result.success).toBe(false);
  });

  it('rejects empty string contrato_id', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: '' });
    expect(result.success).toBe(false);
  });

  it('accepts lowercase UUID format', () => {
    const result = GenerateContractSchema.safeParse({
      contrato_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// close API — input validation
// ============================================================

describe('POST /api/licitaciones/[id]/close — body validation', () => {
  it('accepts confirmar: true', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: true });
    expect(result.success).toBe(true);
  });

  it('rejects confirmar: false', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: false });
    expect(result.success).toBe(false);
  });

  it('rejects empty body', () => {
    const result = CloseLicitacionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects confirmar as a string', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects confirmar as number 1', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects additional fields with wrong confirmar', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: false, extra: 'field' });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// feriados API — POST body validation
// ============================================================

describe('POST /api/admin/licitaciones/feriados — body validation', () => {
  it('accepts valid fecha and nombre', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '2026-01-01',
      nombre: 'Ano Nuevo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects fecha in wrong format (DD/MM/YYYY)', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '01/01/2026',
      nombre: 'Ano Nuevo',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fecha', () => {
    const result = FeriadoSchema.safeParse({ nombre: 'Ano Nuevo' });
    expect(result.success).toBe(false);
  });

  it('rejects missing nombre', () => {
    const result = FeriadoSchema.safeParse({ fecha: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('rejects empty nombre', () => {
    const result = FeriadoSchema.safeParse({ fecha: '2026-01-01', nombre: '' });
    expect(result.success).toBe(false);
  });

  it('rejects nombre exceeding 255 characters', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '2026-01-01',
      nombre: 'A'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('accepts nombre at max length (255)', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '2026-01-01',
      nombre: 'A'.repeat(255),
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// feriados API — PUT body validation
// ============================================================

describe('PUT /api/admin/licitaciones/feriados — body validation', () => {
  it('accepts valid id, fecha, and nombre', () => {
    const result = UpdateFeriadoSchema.safeParse({
      id: 42,
      fecha: '2026-07-16',
      nombre: 'Virgen del Carmen',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
      expect(result.data.fecha).toBe('2026-07-16');
    }
  });

  it('accepts id with only nombre update', () => {
    const result = UpdateFeriadoSchema.safeParse({
      id: 1,
      nombre: 'Nuevo Nombre',
    });
    expect(result.success).toBe(true);
  });

  it('accepts id with only fecha update', () => {
    const result = UpdateFeriadoSchema.safeParse({
      id: 1,
      fecha: '2026-09-18',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = UpdateFeriadoSchema.safeParse({
      fecha: '2026-09-18',
      nombre: 'Independencia',
    });
    expect(result.success).toBe(false);
  });

  it('rejects string id', () => {
    const result = UpdateFeriadoSchema.safeParse({
      id: 'not-a-number',
      nombre: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative id', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: -1, nombre: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects zero id', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 0, nombre: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects fecha in wrong format', () => {
    const result = UpdateFeriadoSchema.safeParse({
      id: 1,
      fecha: '18-09-2026',
    });
    expect(result.success).toBe(false);
  });
});
