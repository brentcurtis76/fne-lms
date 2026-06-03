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

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('cuotas')
      .delete()
      .in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }

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
}
