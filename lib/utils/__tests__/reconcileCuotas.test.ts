// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { reconcileCuotas, type ReconcileCuota } from '../reconcileCuotas';
import type { SupabaseClient } from '@supabase/supabase-js';

type Call =
  | { kind: 'select'; contratoId: string }
  | { kind: 'delete'; ids: string[] }
  | { kind: 'update'; id: string; patch: Record<string, unknown> }
  | { kind: 'insert'; rows: Record<string, unknown>[] };

function makeSupabase(existingIds: string[]) {
  const calls: Call[] = [];

  const fromCuotas = () => ({
    select: (_cols: string) => ({
      eq: (col: string, value: string) => {
        calls.push({ kind: 'select', contratoId: value });
        expect(col).toBe('contrato_id');
        return Promise.resolve({
          data: existingIds.map((id) => ({ id })),
          error: null,
        });
      },
    }),
    delete: () => ({
      in: (col: string, ids: string[]) => {
        expect(col).toBe('id');
        calls.push({ kind: 'delete', ids });
        return Promise.resolve({ error: null });
      },
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: (col: string, id: string) => {
        expect(col).toBe('id');
        calls.push({ kind: 'update', id, patch });
        return Promise.resolve({ error: null });
      },
    }),
    insert: (rows: Record<string, unknown>[]) => {
      calls.push({ kind: 'insert', rows });
      return Promise.resolve({ error: null });
    },
  });

  const supabase = {
    from: vi.fn((table: string) => {
      expect(table).toBe('cuotas');
      return fromCuotas();
    }),
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

describe('reconcileCuotas', () => {
  it('updates surviving rows in place without touching factura_* or pagada', async () => {
    const { supabase, calls } = makeSupabase(['cuota-1', 'cuota-2']);

    const form: ReconcileCuota[] = [
      { id: 'cuota-1', numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
      { id: 'cuota-2', numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
    ];

    await reconcileCuotas(supabase, 'contrato-A', form);

    const updates = calls.filter((c) => c.kind === 'update') as Extract<Call, { kind: 'update' }>[];
    const deletes = calls.filter((c) => c.kind === 'delete');
    const inserts = calls.filter((c) => c.kind === 'insert');

    expect(updates).toHaveLength(2);
    expect(deletes).toHaveLength(0);
    expect(inserts).toHaveLength(0);

    for (const u of updates) {
      expect(Object.keys(u.patch).sort()).toEqual(
        ['fecha_vencimiento', 'monto_uf', 'numero_cuota'].sort()
      );
      expect(u.patch).not.toHaveProperty('pagada');
      expect(u.patch).not.toHaveProperty('factura_url');
      expect(u.patch).not.toHaveProperty('factura_pagada');
      expect(u.patch).not.toHaveProperty('factura_filename');
      expect(u.patch).not.toHaveProperty('factura_size');
      expect(u.patch).not.toHaveProperty('factura_type');
      expect(u.patch).not.toHaveProperty('factura_uploaded_at');
      expect(u.patch).not.toHaveProperty('contrato_id');
      expect(u.patch).not.toHaveProperty('id');
    }

    expect(updates.find((u) => u.id === 'cuota-1')?.patch).toMatchObject({
      numero_cuota: 1,
      fecha_vencimiento: '2026-07-01',
      monto_uf: 10,
    });
    expect(updates.find((u) => u.id === 'cuota-2')?.patch).toMatchObject({
      numero_cuota: 2,
      fecha_vencimiento: '2026-08-01',
      monto_uf: 20,
    });
  });

  it('inserts all rows and deletes nothing when no cuotas exist for the contract', async () => {
    const { supabase, calls } = makeSupabase([]);

    const form: ReconcileCuota[] = [
      { numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
      { numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
    ];

    await reconcileCuotas(supabase, 'contrato-B', form);

    const updates = calls.filter((c) => c.kind === 'update');
    const deletes = calls.filter((c) => c.kind === 'delete');
    const inserts = calls.filter((c) => c.kind === 'insert') as Extract<Call, { kind: 'insert' }>[];

    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(2);

    for (const row of inserts[0].rows) {
      expect(row).toMatchObject({ contrato_id: 'contrato-B', pagada: false });
      expect(row).not.toHaveProperty('id');
    }
  });

  it('treats a stale form id not found in DB as a fresh insert', async () => {
    const { supabase, calls } = makeSupabase(['cuota-real']);

    const form: ReconcileCuota[] = [
      { id: 'cuota-real', numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
      { id: 'cuota-stale', numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
    ];

    await reconcileCuotas(supabase, 'contrato-C', form);

    const updates = calls.filter((c) => c.kind === 'update') as Extract<Call, { kind: 'update' }>[];
    const deletes = calls.filter((c) => c.kind === 'delete');
    const inserts = calls.filter((c) => c.kind === 'insert') as Extract<Call, { kind: 'insert' }>[];

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('cuota-real');

    expect(deletes).toHaveLength(0);

    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(1);
    expect(inserts[0].rows[0]).toMatchObject({
      contrato_id: 'contrato-C',
      numero_cuota: 2,
      fecha_vencimiento: '2026-08-01',
      monto_uf: 20,
      pagada: false,
    });
    expect(inserts[0].rows[0]).not.toHaveProperty('id');
  });
});
