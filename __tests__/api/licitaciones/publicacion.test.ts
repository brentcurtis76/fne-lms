// @vitest-environment node

/**
 * Task-specific tests for the PublicacionSchema (used in POST /api/licitaciones/[id]/publicacion)
 * and the UpdateTimelineSchema (used in PATCH /api/licitaciones/[id]).
 * Tests use synthetic data only.
 */

import { describe, it, expect } from 'vitest';
import { PublicacionSchema, UpdateTimelineSchema } from '../../../types/licitaciones';

// -------------------------------------------------------
// PublicacionSchema — POST body validation
// -------------------------------------------------------

describe('POST /api/licitaciones/[id]/publicacion — PublicacionSchema validation', () => {
  it('accepts a valid fecha_publicacion in YYYY-MM-DD format', () => {
    const result = PublicacionSchema.safeParse({ fecha_publicacion: '2026-03-15' });
    expect(result.success).toBe(true);
  });

  it('rejects fecha_publicacion in DD/MM/YYYY format', () => {
    const result = PublicacionSchema.safeParse({ fecha_publicacion: '15/03/2026' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string for fecha_publicacion', () => {
    const result = PublicacionSchema.safeParse({ fecha_publicacion: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing fecha_publicacion', () => {
    const result = PublicacionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts optional publicacion_imagen_url as null', () => {
    const result = PublicacionSchema.safeParse({
      fecha_publicacion: '2026-03-15',
      publicacion_imagen_url: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts publicacion_imagen_url as a storage path string', () => {
    const result = PublicacionSchema.safeParse({
      fecha_publicacion: '2026-03-15',
      publicacion_imagen_url: 'licitaciones/some-uuid/image.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects partial date format (YYYY-MM)', () => {
    const result = PublicacionSchema.safeParse({ fecha_publicacion: '2026-03' });
    expect(result.success).toBe(false);
  });

  it('accepts fecha_publicacion at year boundaries', () => {
    expect(PublicacionSchema.safeParse({ fecha_publicacion: '2024-01-01' }).success).toBe(true);
    expect(PublicacionSchema.safeParse({ fecha_publicacion: '2030-12-31' }).success).toBe(true);
  });
});

// -------------------------------------------------------
// UpdateTimelineSchema — PATCH timeline fields validation
// -------------------------------------------------------

describe('PATCH /api/licitaciones/[id] — UpdateTimelineSchema validation', () => {
  it('accepts all optional date fields when all provided', () => {
    const result = UpdateTimelineSchema.safeParse({
      fecha_limite_solicitud_bases: '2026-03-20',
      fecha_limite_consultas: '2026-03-23',
      fecha_inicio_propuestas: '2026-03-24',
      fecha_limite_propuestas: '2026-03-30',
      fecha_limite_evaluacion: '2026-04-02',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = UpdateTimelineSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial update (only one date)', () => {
    const result = UpdateTimelineSchema.safeParse({
      fecha_limite_solicitud_bases: '2026-03-20',
    });
    expect(result.success).toBe(true);
  });

  it('rejects date field in wrong format', () => {
    const result = UpdateTimelineSchema.safeParse({
      fecha_limite_solicitud_bases: '20-03-2026',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-date string', () => {
    const result = UpdateTimelineSchema.safeParse({
      fecha_limite_consultas: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});
