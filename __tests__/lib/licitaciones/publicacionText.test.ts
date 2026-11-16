// @vitest-environment node
/**
 * LIC-A3 (GENERA fixes F14): the publication text carries the real deadline —
 * the one the timeline function computes from the date typed, or the stored
 * one once confirmed; with no date yet it keeps the placeholder.
 * Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { buildPublicacionText, FECHA_PENDIENTE, formatDateInline } from '@/lib/licitaciones/publicacionText';
import { calculateTimeline } from '@/lib/licitacionService';
import type { LicitacionDetail } from '@/types/licitaciones';

const base = {
  estado: 'publicacion_pendiente',
  email_licitacion: 'licitacion@inventado.test',
  fecha_limite_solicitud_bases: null,
  school: { id: 1, name: 'Escuela Inventada' },
  cliente: { nombre_fantasia: 'Colegio Inventado', comuna: 'Comuna Ficticia' },
} as unknown as LicitacionDetail;

/** A client that answers the holidays query with no holidays. */
const noHolidays = {
  from: () => {
    const q: any = { select: () => q, gte: () => q, lte: () => q, eq: () => q, order: () => q,
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) };
    return q;
  },
} as never;

describe('buildPublicacionText', () => {
  it('keeps the placeholder when no date has been typed', () => {
    const text = buildPublicacionText(base, null);
    expect(text).toContain(`hasta el ${FECHA_PENDIENTE} al correo licitacion@inventado.test`);
    expect(text).toContain('el Colegio Inventado, de la comuna de Comuna Ficticia');
  });

  it('prints the same deadline the timeline function gives for the date typed', async () => {
    const timeline = await calculateTimeline(noHolidays, '2026-11-02');
    expect(timeline.fecha_limite_solicitud_bases).toBeTruthy();
    const text = buildPublicacionText(base, timeline);
    expect(text).toContain(`hasta el ${formatDateInline(timeline.fecha_limite_solicitud_bases)} al correo`);
    expect(text).not.toContain(FECHA_PENDIENTE);
  });

  it('once confirmed, prints the stored deadline (not a typed one)', () => {
    const confirmed = { ...base, estado: 'recepcion_bases_pendiente', fecha_limite_solicitud_bases: '2026-11-20' } as LicitacionDetail;
    const text = buildPublicacionText(confirmed, { fecha_limite_solicitud_bases: '2026-12-31' });
    expect(text).toContain('hasta el 20 de noviembre de 2026 al correo');
  });

  it('is empty without a client to name (the screen then says so)', () => {
    expect(buildPublicacionText({ ...base, cliente: null } as LicitacionDetail, null)).toBe('');
  });
});
