// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { reconcileCuotas, type ReconcileCuota } from '../reconcileCuotas';
import type { SupabaseClient } from '@supabase/supabase-js';

type Call =
  | { kind: 'select'; contratoId: string }
  | { kind: 'delete'; ids: string[] }
  | { kind: 'update'; id: string; patch: Record<string, unknown> }
  | { kind: 'insert'; rows: Record<string, unknown>[] };

function makeSupabaseMock(existingIds: string[]) {
  const calls: Call[] = [];

  const fromCuotas = () => ({
    select: (_cols: string) => ({
      eq: (col: string, value: string) => {
        expect(col).toBe('contrato_id');
        calls.push({ kind: 'select', contratoId: value });
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
  it('deletes removed ids, updates survivors in place, and inserts new rows', async () => {
    const { supabase, calls } = makeSupabaseMock(['a', 'b', 'c']);

    const form: ReconcileCuota[] = [
      { id: 'a', numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
      { id: 'b', numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
      { numero_cuota: 3, fecha_vencimiento: '2026-09-01', monto_uf: 30 },
    ];

    await reconcileCuotas(supabase, 'contract-1', form);

    const updates = calls.filter((c) => c.kind === 'update') as Extract<Call, { kind: 'update' }>[];
    const deletes = calls.filter((c) => c.kind === 'delete') as Extract<Call, { kind: 'delete' }>[];
    const inserts = calls.filter((c) => c.kind === 'insert') as Extract<Call, { kind: 'insert' }>[];

    expect(deletes).toHaveLength(1);
    expect(deletes[0].ids).toEqual(['c']);

    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.id).sort()).toEqual(['a', 'b']);

    for (const u of updates) {
      expect(Object.keys(u.patch).sort()).toEqual(
        ['fecha_vencimiento', 'monto_uf', 'numero_cuota'].sort()
      );
      expect(u.patch).not.toHaveProperty('factura_url');
      expect(u.patch).not.toHaveProperty('factura_pagada');
      expect(u.patch).not.toHaveProperty('factura_filename');
      expect(u.patch).not.toHaveProperty('factura_size');
      expect(u.patch).not.toHaveProperty('factura_type');
      expect(u.patch).not.toHaveProperty('factura_uploaded_at');
      expect(u.patch).not.toHaveProperty('pagada');
      expect(u.patch).not.toHaveProperty('contrato_id');
      expect(u.patch).not.toHaveProperty('id');
    }

    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(1);
    expect(inserts[0].rows[0]).toMatchObject({
      contrato_id: 'contract-1',
      numero_cuota: 3,
      pagada: false,
    });
  });

  it('inserts all rows and runs no deletes or updates when no cuotas exist', async () => {
    const { supabase, calls } = makeSupabaseMock([]);

    const form: ReconcileCuota[] = [
      { numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
    ];

    await reconcileCuotas(supabase, 'contract-1', form);

    const updates = calls.filter((c) => c.kind === 'update');
    const deletes = calls.filter((c) => c.kind === 'delete');
    const inserts = calls.filter((c) => c.kind === 'insert') as Extract<Call, { kind: 'insert' }>[];

    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(1);
  });

  it('treats a stale form id not found in DB as a fresh insert', async () => {
    const { supabase, calls } = makeSupabaseMock(['a']);

    const form: ReconcileCuota[] = [
      { id: 'a', numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
      { id: 'ghost', numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
    ];

    await reconcileCuotas(supabase, 'contract-1', form);

    const updates = calls.filter((c) => c.kind === 'update') as Extract<Call, { kind: 'update' }>[];
    const deletes = calls.filter((c) => c.kind === 'delete');
    const inserts = calls.filter((c) => c.kind === 'insert') as Extract<Call, { kind: 'insert' }>[];

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('a');

    expect(deletes).toHaveLength(0);

    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(1);
    expect(inserts[0].rows[0]).toMatchObject({
      contrato_id: 'contract-1',
      numero_cuota: 2,
      fecha_vencimiento: '2026-08-01',
      monto_uf: 20,
      pagada: false,
    });
    expect(inserts[0].rows[0]).not.toHaveProperty('id');
  });
});
