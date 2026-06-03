// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { reconcileCuotas, attachExistingCuotaIds, type ReconcileCuota } from '../reconcileCuotas';
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

  it('runs the delete only after updates and inserts (delete is the last op)', async () => {
    const { supabase, calls } = makeSupabaseMock(['a', 'b']);

    // 'a' survives (update), 'b' is removed (delete), one new row is inserted
    await reconcileCuotas(supabase, 'contract-1', [
      { id: 'a', numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
      { numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
    ]);

    const order = calls.map((c) => c.kind);
    const lastDelete = order.lastIndexOf('delete');
    expect(lastDelete).toBeGreaterThan(-1);
    expect(lastDelete).toBeGreaterThan(order.lastIndexOf('update'));
    expect(lastDelete).toBeGreaterThan(order.lastIndexOf('insert'));
  });
});

describe('attachExistingCuotaIds', () => {
  it('hydrates a fully id-less schedule by numero_cuota', () => {
    const form = [
      { numero_cuota: 1, monto: 10 },
      { numero_cuota: 2, monto: 20 },
    ];
    const out = attachExistingCuotaIds(form, [
      { id: 'a', numero_cuota: 1 },
      { id: 'b', numero_cuota: 2 },
    ]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('returns the input unchanged when any row already has an id', () => {
    const form = [
      { id: 'x', numero_cuota: 1 },
      { numero_cuota: 2 },
    ];
    const out = attachExistingCuotaIds(form, [
      { id: 'a', numero_cuota: 1 },
      { id: 'b', numero_cuota: 2 },
    ]);
    expect(out).toBe(form);
    expect(out.map((c) => c.id)).toEqual(['x', undefined]);
  });

  it('leaves a numero_cuota with no existing match unbound', () => {
    const out = attachExistingCuotaIds([{ numero_cuota: 5, monto: 50 }], [
      { id: 'a', numero_cuota: 1 },
    ]);
    expect(out[0].id).toBeUndefined();
  });

  it('dup-draft path: hydrate id-less schedule, then reconcile updates in place (no delete)', async () => {
    const { supabase, calls } = makeSupabaseMock(['a', 'b']);

    const hydrated = attachExistingCuotaIds(
      [
        { numero_cuota: 1, fecha_vencimiento: '2026-07-01', monto_uf: 10 },
        { numero_cuota: 2, fecha_vencimiento: '2026-08-01', monto_uf: 20 },
      ],
      [
        { id: 'a', numero_cuota: 1 },
        { id: 'b', numero_cuota: 2 },
      ]
    );

    await reconcileCuotas(supabase, 'contract-1', hydrated);

    expect(calls.filter((c) => c.kind === 'update')).toHaveLength(2);
    expect(calls.filter((c) => c.kind === 'delete')).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
  });
});
