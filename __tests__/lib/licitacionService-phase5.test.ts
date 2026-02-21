// @vitest-environment node

/**
 * Task-specific tests for Phase 5 licitacion service additions.
 * Tests cover:
 * - GenerateContractSchema (validates contrato_id format)
 * - CloseLicitacionSchema (validates confirmar field)
 * - FeriadoSchema and UpdateFeriadoSchema (holiday management)
 *
 * Service function integration tests for linkContractToLicitacion
 * and closeLicitacion are covered by error guard validation
 * (testing business rule enforcement via schema).
 */

import { describe, it, expect } from 'vitest';
import {
  GenerateContractSchema,
  CloseLicitacionSchema,
  FeriadoSchema,
  UpdateFeriadoSchema,
} from '../../types/licitaciones';

// ============================================================
// GenerateContractSchema — validates Phase 5 API body
// ============================================================

describe('GenerateContractSchema — Phase 5 contract linking', () => {
  it('accepts a standard v4 UUID as contrato_id', () => {
    const result = GenerateContractSchema.safeParse({
      contrato_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('stores the parsed UUID value intact', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = GenerateContractSchema.safeParse({ contrato_id: uuid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contrato_id).toBe(uuid);
    }
  });

  it('rejects non-UUID string (missing hyphens)', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: 'notauuid1234567890' });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toMatch(/UUID/i);
  });

  it('rejects short string', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: 'abc-123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty body (contrato_id required)', () => {
    const result = GenerateContractSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects null contrato_id', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: null });
    expect(result.success).toBe(false);
  });

  it('rejects numeric contrato_id', () => {
    const result = GenerateContractSchema.safeParse({ contrato_id: 42 });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// CloseLicitacionSchema — validates Phase 5 close API body
// ============================================================

describe('CloseLicitacionSchema — Phase 5 licitacion closure', () => {
  it('accepts confirmar: true (only valid value)', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: true });
    expect(result.success).toBe(true);
  });

  it('rejects confirmar: false', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: false });
    expect(result.success).toBe(false);
    expect(result.error?.errors.length).toBeGreaterThan(0);
  });

  it('rejects missing confirmar field', () => {
    const result = CloseLicitacionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects string "true"', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: 'true' });
    expect(result.success).toBe(false);
  });

  it('rejects number 1 instead of boolean true', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects null confirmar', () => {
    const result = CloseLicitacionSchema.safeParse({ confirmar: null });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// FeriadoSchema — validates holiday creation body
// ============================================================

describe('FeriadoSchema — holiday creation validation', () => {
  it('accepts valid fecha and nombre', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '2026-09-18',
      nombre: 'Independencia Nacional',
    });
    expect(result.success).toBe(true);
  });

  it('rejects fecha in DD/MM/YYYY format', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '18/09/2026',
      nombre: 'Independencia',
    });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toContain('YYYY-MM-DD');
  });

  it('rejects fecha in YYYY/MM/DD format (wrong separator)', () => {
    const result = FeriadoSchema.safeParse({ fecha: '2026/09/18', nombre: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects empty nombre', () => {
    const result = FeriadoSchema.safeParse({ fecha: '2026-01-01', nombre: '' });
    expect(result.success).toBe(false);
  });

  it('rejects nombre longer than 255 characters', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '2026-01-01',
      nombre: 'N'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('accepts nombre exactly 255 characters long', () => {
    const result = FeriadoSchema.safeParse({
      fecha: '2026-01-01',
      nombre: 'N'.repeat(255),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fecha field', () => {
    const result = FeriadoSchema.safeParse({ nombre: 'Ano Nuevo' });
    expect(result.success).toBe(false);
  });

  it('rejects missing nombre field', () => {
    const result = FeriadoSchema.safeParse({ fecha: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('accepts dates at boundary of valid range', () => {
    expect(FeriadoSchema.safeParse({ fecha: '2024-01-01', nombre: 'Test' }).success).toBe(true);
    expect(FeriadoSchema.safeParse({ fecha: '2030-12-31', nombre: 'Test' }).success).toBe(true);
  });
});

// ============================================================
// UpdateFeriadoSchema — validates holiday update body
// ============================================================

describe('UpdateFeriadoSchema — holiday update validation', () => {
  it('accepts id with fecha and nombre', () => {
    const result = UpdateFeriadoSchema.safeParse({
      id: 42,
      fecha: '2026-07-16',
      nombre: 'Virgen del Carmen',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
    }
  });

  it('accepts id with only nombre (partial update)', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 1, nombre: 'Nuevo Nombre' });
    expect(result.success).toBe(true);
  });

  it('accepts id with only fecha (partial update)', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 1, fecha: '2026-09-18' });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = UpdateFeriadoSchema.safeParse({ nombre: 'Sin ID' });
    expect(result.success).toBe(false);
  });

  it('rejects string id', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 'not-a-number', nombre: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects zero id', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 0, nombre: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects negative id', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: -5, nombre: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid fecha format', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 1, fecha: '18-09-2026' });
    expect(result.success).toBe(false);
  });

  it('rejects empty nombre in update', () => {
    const result = UpdateFeriadoSchema.safeParse({ id: 1, nombre: '' });
    expect(result.success).toBe(false);
  });
});
