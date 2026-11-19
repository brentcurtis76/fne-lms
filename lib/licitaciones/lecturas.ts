/**
 * Reads the state rules need (GENERA fixes F20, LIC-D1, send-back 1).
 * The rules themselves are pure and live in lib/licitaciones/estados.ts.
 */

import type { createServiceRoleClient } from '@/lib/api-auth';

type Client = ReturnType<typeof createServiceRoleClient>;

/**
 * A historical record: a closed tender with no committee, no provider with a
 * proposal and no score — the same test the detail page uses to show the
 * archive view (pages/licitaciones/[id].tsx, data of /api/licitaciones/[id]/evaluacion).
 * Any read error counts as "not historical" (the protected action is then refused).
 */
export async function esLicitacionHistorica(serviceClient: Client, licitacionId: string): Promise<boolean> {
  const [comisionRes, atesRes, evaluacionesRes] = await Promise.all([
    serviceClient.from('licitacion_comision').select('id').eq('licitacion_id', licitacionId).limit(1),
    serviceClient
      .from('licitacion_ates')
      .select('id')
      .eq('licitacion_id', licitacionId)
      .not('propuesta_url', 'is', null)
      .limit(1),
    serviceClient.from('licitacion_evaluaciones').select('id').eq('licitacion_id', licitacionId).limit(1),
  ]);
  return [comisionRes, atesRes, evaluacionesRes].every(
    r => !r.error && Array.isArray(r.data) && r.data.length === 0
  );
}

export type LecturaEstado =
  | { ok: true; estado: string }
  | { ok: false; status: 404 | 500; message: string };

/**
 * The tender's estado as it is now, read again just before a protected write
 * that follows a slow step. No row → 404; any other error → 500.
 */
export async function leerEstadoActual(client: Client, licitacionId: string): Promise<LecturaEstado> {
  const { data, error } = await client
    .from('licitaciones')
    .select('estado')
    .eq('id', licitacionId)
    .single();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    return { ok: false, status: 500, message: error.message || 'Error al leer el estado de la licitacion' };
  }
  if (!data) {
    return { ok: false, status: 404, message: 'Licitacion no encontrada' };
  }
  return { ok: true, estado: (data as { estado: string }).estado };
}
