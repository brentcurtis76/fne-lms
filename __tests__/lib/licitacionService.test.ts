// @vitest-environment node

/**
 * Task-specific tests for lib/licitacionService.ts
 * Tests pure/deterministic functions that don't require DB connections.
 */

import { describe, it, expect } from 'vitest';
import { generatePublicacionText } from '../../lib/licitacionService';
import type { Licitacion } from '../../types/licitaciones';

// -------------------------------------------------------
// Synthetic test data (no real school names / emails)
// -------------------------------------------------------

function makeLicitacion(overrides: Partial<Licitacion> = {}): Licitacion {
  return {
    id: 'test-lic-001',
    numero_licitacion: 'LIC-2026-TST001-001',
    school_id: 1,
    cliente_id: 'cliente-001',
    programa_id: 'programa-001',
    nombre_licitacion: 'Asesoria Educativa Test',
    year: 2026,
    estado: 'publicacion_pendiente',
    email_licitacion: 'lic.test@escuela-test.cl',
    monto_minimo: 10,
    monto_maximo: 100,
    tipo_moneda: 'UF',
    duracion_minima: '6 meses',
    duracion_maxima: '12 meses',
    peso_evaluacion_tecnica: 70,
    peso_evaluacion_economica: 30,
    created_at: '2026-02-20T00:00:00.000Z',
    updated_at: '2026-02-20T00:00:00.000Z',
    ...overrides,
  };
}

// -------------------------------------------------------
// generatePublicacionText
// -------------------------------------------------------

describe('generatePublicacionText', () => {
  it('includes the school name in the output', () => {
    const lic = makeLicitacion();
    const text = generatePublicacionText(lic, 'Colegio Test', 'Santiago');
    expect(text).toContain('Colegio Test');
  });

  it('includes the comuna in the output', () => {
    const lic = makeLicitacion();
    const text = generatePublicacionText(lic, 'Colegio Test', 'Providencia');
    expect(text).toContain('Providencia');
  });

  it('includes the licitacion email address', () => {
    const lic = makeLicitacion({ email_licitacion: 'lic.qa.test@escuela.cl' });
    const text = generatePublicacionText(lic, 'Colegio Test', 'Santiago');
    expect(text).toContain('lic.qa.test@escuela.cl');
  });

  it('shows [fecha pendiente] when fecha_limite_solicitud_bases is missing', () => {
    const lic = makeLicitacion({ fecha_limite_solicitud_bases: null });
    const text = generatePublicacionText(lic, 'Colegio Test', 'Santiago');
    expect(text).toContain('[fecha pendiente]');
  });

  it('formats fecha_limite_solicitud_bases as human-readable date', () => {
    const lic = makeLicitacion({ fecha_limite_solicitud_bases: '2026-03-15' });
    const text = generatePublicacionText(lic, 'Colegio Test', 'Santiago');
    // Should contain "15 de marzo de 2026"
    expect(text).toContain('15 de marzo de 2026');
  });

  it('contains the ATE contracting service description', () => {
    const lic = makeLicitacion();
    const text = generatePublicacionText(lic, 'Colegio Test', 'Maipu');
    expect(text).toContain('concurso publico');
    expect(text).toContain('servicios ATE');
  });

  it('contains the bases solicitud instructions', () => {
    const lic = makeLicitacion();
    const text = generatePublicacionText(lic, 'Colegio Test', 'Maipu');
    expect(text).toContain('Bases de la licitacion se pueden solicitar');
  });

  it('returns a non-empty string', () => {
    const lic = makeLicitacion();
    const text = generatePublicacionText(lic, 'Colegio Test', 'Santiago');
    expect(text.length).toBeGreaterThan(50);
  });

  it('different school names produce different texts', () => {
    const lic = makeLicitacion();
    const text1 = generatePublicacionText(lic, 'Escuela A', 'Santiago');
    const text2 = generatePublicacionText(lic, 'Escuela B', 'Santiago');
    expect(text1).not.toEqual(text2);
  });

  it('different comunas produce different texts', () => {
    const lic = makeLicitacion();
    const text1 = generatePublicacionText(lic, 'Colegio Test', 'Santiago');
    const text2 = generatePublicacionText(lic, 'Colegio Test', 'Valparaiso');
    expect(text1).not.toEqual(text2);
  });
});

// -------------------------------------------------------
// ESTADO_DISPLAY type tests via types/licitaciones.ts
// -------------------------------------------------------

import { ESTADO_DISPLAY, type LicitacionEstado } from '../../types/licitaciones';

describe('ESTADO_DISPLAY', () => {
  const expectedEstados: LicitacionEstado[] = [
    'borrador',
    'publicacion_pendiente',
    'recepcion_bases_pendiente',
    'propuestas_pendientes',
    'evaluacion_pendiente',
    'adjudicacion_pendiente',
    'contrato_pendiente',
    'contrato_generado',
    'adjudicada_externo',
    'cerrada',
  ];

  it('has entries for all 10 estados', () => {
    expect(Object.keys(ESTADO_DISPLAY)).toHaveLength(10);
  });

  it.each(expectedEstados)('has display info for estado: %s', (estado) => {
    expect(ESTADO_DISPLAY[estado]).toBeDefined();
    expect(ESTADO_DISPLAY[estado].label).toBeTruthy();
    expect(ESTADO_DISPLAY[estado].color).toBeTruthy();
    expect(ESTADO_DISPLAY[estado].bg).toBeTruthy();
  });

  it('borrador shows as gray', () => {
    expect(ESTADO_DISPLAY.borrador.bg).toContain('gray');
  });

  it('publicacion_pendiente shows as yellow', () => {
    expect(ESTADO_DISPLAY.publicacion_pendiente.bg).toContain('yellow');
  });

  it('contrato_generado shows as green', () => {
    expect(ESTADO_DISPLAY.contrato_generado.bg).toContain('green');
  });
});

// -------------------------------------------------------
// CreateLicitacionSchema validation
// -------------------------------------------------------

import { CreateLicitacionSchema } from '../../types/licitaciones';

describe('CreateLicitacionSchema', () => {
  const validInput = {
    school_id: 1,
    programa_id: 'prog-123',
    nombre_licitacion: 'Licitacion Test 2026',
    email_licitacion: 'test@escuela.cl',
    monto_minimo: 10,
    monto_maximo: 100,
    tipo_moneda: 'UF',
    duracion_minima: '6 meses',
    duracion_maxima: '12 meses',
    peso_evaluacion_tecnica: 70,
    year: 2026,
  };

  it('accepts a valid input', () => {
    const result = CreateLicitacionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects when monto_maximo < monto_minimo', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      monto_minimo: 100,
      monto_maximo: 50,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map(e => e.path[0]);
      expect(paths).toContain('monto_maximo');
    }
  });

  it('rejects invalid email', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      email_licitacion: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects peso_evaluacion_tecnica = 0 (must be >= 1)', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      peso_evaluacion_tecnica: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects peso_evaluacion_tecnica = 100 (must be <= 99)', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      peso_evaluacion_tecnica: 100,
    });
    expect(result.success).toBe(false);
  });

  it('coerces school_id from string to number', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      school_id: '42',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.school_id).toBe(42);
    }
  });

  it('defaults tipo_moneda to UF when not provided', () => {
    const { tipo_moneda: _, ...withoutMoneda } = validInput;
    const result = CreateLicitacionSchema.safeParse(withoutMoneda);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo_moneda).toBe('UF');
    }
  });

  it('accepts monto_maximo equal to monto_minimo (boundary)', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      monto_minimo: 50,
      monto_maximo: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects year outside 2024-2030 range', () => {
    const result = CreateLicitacionSchema.safeParse({
      ...validInput,
      year: 2031,
    });
    expect(result.success).toBe(false);
  });
});
