/**
 * Cuota reconciliation helper.
 *
 * Error report #3B1191D3: edit-mode schedule saves were deleting all `cuotas`
 * rows for a contract and re-inserting them, wiping `factura_url`,
 * `factura_filename`, `factura_size`, `factura_type`, `factura_uploaded_at`,
 * `factura_pagada`, and `pagada` state in the process.
 *
 * This helper reconciles by primary key: surviving rows are updated in place
 * (touching only schedule fields), removed rows are deleted, and new rows are
 * inserted. Factura fields and `pagada` are never written by updates, so
 * invoice metadata and payment state are preserved across schedule edits.
 *
 * Ordering: updates and inserts run BEFORE deletes. The delete is the only
 * destructive operation, so doing it last means a failure partway through the
 * reconcile can never orphan a factura — nothing is removed until the rest has
 * succeeded. This is safe because there is no `(contrato_id, numero_cuota)` unique
 * constraint, so transient duplicate numbers during the update/insert phase are
 * harmless. (Full atomicity would require a DB transaction/RPC.)
 *
 * Out of scope: storage cleanup for cuotas that are explicitly deleted here.
 * Orphaned factura files in storage are handled elsewhere.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReconcileCuota {
  id?: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  monto_uf: number;
}

export async function reconcileCuotas(
  supabase: SupabaseClient,
  contratoId: string,
  cuotas: ReconcileCuota[]
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from('cuotas')
    .select('id')
    .eq('contrato_id', contratoId);

  if (selectError) throw selectError;

  const existingIds = new Set<string>((existing ?? []).map((row: { id: string }) => row.id));

  const survivingIds = new Set<string>();
  const updates: { id: string; numero_cuota: number; fecha_vencimiento: string; monto_uf: number }[] = [];
  const inserts: {
    contrato_id: string;
    numero_cuota: number;
    fecha_vencimiento: string;
    monto_uf: number;
    pagada: boolean;
  }[] = [];

  for (const cuota of cuotas) {
    if (cuota.id && existingIds.has(cuota.id)) {
      survivingIds.add(cuota.id);
      updates.push({
        id: cuota.id,
        numero_cuota: cuota.numero_cuota,
        fecha_vencimiento: cuota.fecha_vencimiento,
        monto_uf: cuota.monto_uf,
      });
    } else {
      inserts.push({
        contrato_id: contratoId,
        numero_cuota: cuota.numero_cuota,
        fecha_vencimiento: cuota.fecha_vencimiento,
        monto_uf: cuota.monto_uf,
        pagada: false,
      });
    }
  }

  const idsToDelete: string[] = [];
  for (const id of existingIds) {
    if (!survivingIds.has(id)) idsToDelete.push(id);
  }

  // Apply non-destructive operations first: updates, then inserts.
  for (const update of updates) {
    const { id, ...patch } = update;
    const { error: updateError } = await supabase
      .from('cuotas')
      .update(patch)
      .eq('id', id);
    if (updateError) throw updateError;
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('cuotas').insert(inserts);
    if (insertError) throw insertError;
  }

  // Delete removed rows LAST. The delete is the only destructive step, so running
  // it after updates/inserts means a failure earlier in the reconcile can never
  // orphan a factura before the rest of the schedule has been persisted.
  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('cuotas')
      .delete()
      .in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }
}

/**
 * Attach existing cuota ids to an entirely id-less schedule, matched by
 * `numero_cuota`.
 *
 * Used when a brand-new contract form is saved over a pre-existing draft (matched
 * by `numero_contrato`): the form rows carry no cuota ids, so without this every
 * row would look new to {@link reconcileCuotas} and the draft's existing cuotas
 * would be deleted then re-inserted — wiping any uploaded facturas/`pagada`
 * (#3B1191D3). Hydrating the ids lets those rows update in place instead.
 *
 * Only acts on a fully id-less input; if any row already carries an id (a normal
 * edit with a freshly added row) the input is returned unchanged, so a new row is
 * never accidentally bound to an existing cuota.
 */
export function attachExistingCuotaIds<T extends { id?: string; numero_cuota: number }>(
  cuotas: T[],
  existing: { id: string; numero_cuota: number }[]
): T[] {
  if (cuotas.length === 0 || !cuotas.every((c) => !c.id)) return cuotas;
  const idByNumero = new Map<number, string>(existing.map((row) => [row.numero_cuota, row.id]));
  return cuotas.map((c) => ({ ...c, id: idByNumero.get(c.numero_cuota) }));
}
