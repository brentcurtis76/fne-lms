/**
 * Evaluacion Service — Score Calculation Engine
 * Phase 4: Licitaciones Evaluation System
 *
 * Pure calculation functions are separated from DB persistence functions
 * to allow clean unit testing without database dependencies.
 *
 * All exported pure functions: no DB calls, no side effects.
 * All exported persistence functions: accept SupabaseClient as first param.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EvaluationScore, CommitteeMember } from '@/types/licitaciones';

// ============================================================
// PURE CALCULATION FUNCTIONS (unit-testable, no DB)
// ============================================================

/**
 * Calculates economic scores for a list of ATEs.
 * Formula: (min_price / ate_price) x 100
 * - If only 1 ATE: score = 100
 * - Throws if any ATE has monto_propuesto <= 0
 * - Rounds to 1 decimal place
 */
export function calculateEconomicScores(
  ates: Array<{ id: string; monto_propuesto: number }>
): Array<{ id: string; puntaje_economico: number }> {
  if (ates.length === 0) return [];

  for (const ate of ates) {
    if (ate.monto_propuesto <= 0) {
      throw new Error(`El monto propuesto de la ATE ${ate.id} debe ser mayor a 0`);
    }
  }

  if (ates.length === 1) {
    return [{ id: ates[0].id, puntaje_economico: 100 }];
  }

  const minPrice = Math.min(...ates.map(a => a.monto_propuesto));

  return ates.map(ate => ({
    id: ate.id,
    puntaje_economico: Math.round((minPrice / ate.monto_propuesto) * 100 * 10) / 10,
  }));
}

/**
 * Calculates weighted scores for a single ATE.
 * - puntaje_tecnico_ponderado = puntajeTecnico * (pesoTecnico / 100)
 * - puntaje_economico_ponderado = puntajeEconomico * (pesoEconomico / 100)
 * - puntaje_total = sum of both
 * - All values rounded to 1 decimal place
 */
export function calculateWeightedScores(
  puntajeTecnico: number,
  puntajeEconomico: number,
  pesoTecnico: number,
  pesoEconomico: number
): { puntaje_tecnico_ponderado: number; puntaje_economico_ponderado: number; puntaje_total: number } {
  const tecPond = Math.round(puntajeTecnico * (pesoTecnico / 100) * 10) / 10;
  const ecoPond = Math.round(puntajeEconomico * (pesoEconomico / 100) * 10) / 10;
  const total = Math.round((tecPond + ecoPond) * 10) / 10;

  return {
    puntaje_tecnico_ponderado: tecPond,
    puntaje_economico_ponderado: ecoPond,
    puntaje_total: total,
  };
}

/**
 * Ranks ATEs by total score (descending).
 * - Assigns rank 1, 2, 3...
 * - es_ganador = true only for rank 1
 * - Ties at rank 1: both get rank 1, both es_ganador = true
 */
export function rankATEs(
  ates: Array<{ id: string; puntaje_total: number }>
): Array<{ id: string; puntaje_total: number; rank: number; es_ganador: boolean }> {
  if (ates.length === 0) return [];

  const sorted = [...ates].sort((a, b) => b.puntaje_total - a.puntaje_total);

  const topScore = sorted[0].puntaje_total;
  let rankCounter = 1;

  return sorted.map((ate, idx) => {
    if (idx > 0 && ate.puntaje_total < sorted[idx - 1].puntaje_total) {
      rankCounter = idx + 1;
    }
    return {
      id: ate.id,
      puntaje_total: ate.puntaje_total,
      rank: ate.puntaje_total === topScore ? 1 : rankCounter,
      es_ganador: ate.puntaje_total === topScore,
    };
  });
}

// ============================================================
// DB PERSISTENCE FUNCTIONS
// ============================================================

/**
 * Upserts evaluation scores into licitacion_evaluaciones.
 * Uses the unique index on (licitacion_id, ate_id, criterio_id).
 */
export async function saveEvaluationScores(
  supabase: SupabaseClient,
  licitacionId: string,
  scores: EvaluationScore[],
  userId: string
): Promise<void> {
  if (scores.length === 0) return;

  const rows = scores.map(s => ({
    licitacion_id: licitacionId,
    ate_id: s.ate_id,
    criterio_id: s.criterio_id,
    puntaje: s.puntaje,
    comentario: s.comentario ?? null,
    evaluado_por: userId,
  }));

  const { error } = await supabase
    .from('licitacion_evaluaciones')
    .upsert(rows, { onConflict: 'licitacion_id,ate_id,criterio_id' });

  if (error) {
    throw new Error(`Error al guardar puntajes de evaluacion: ${error.message}`);
  }
}

/**
 * Updates licitacion_ates with calculated score fields.
 */
export async function saveCalculatedScores(
  supabase: SupabaseClient,
  licitacionId: string,
  ateScores: Array<{
    id: string;
    monto_propuesto: number;
    puntaje_tecnico: number;
    puntaje_economico: number;
    puntaje_tecnico_ponderado: number;
    puntaje_economico_ponderado: number;
    puntaje_total: number;
    es_ganador: boolean;
  }>
): Promise<void> {
  for (const ate of ateScores) {
    const { error } = await supabase
      .from('licitacion_ates')
      .update({
        monto_propuesto: ate.monto_propuesto,
        puntaje_tecnico: ate.puntaje_tecnico,
        puntaje_economico: ate.puntaje_economico,
        puntaje_tecnico_ponderado: ate.puntaje_tecnico_ponderado,
        puntaje_economico_ponderado: ate.puntaje_economico_ponderado,
        puntaje_total: ate.puntaje_total,
        es_ganador: ate.es_ganador,
      })
      .eq('id', ate.id)
      .eq('licitacion_id', licitacionId);

    if (error) {
      throw new Error(`Error al guardar puntajes calculados para ATE ${ate.id}: ${error.message}`);
    }
  }
}

/**
 * Saves committee members for a licitacion.
 * Deletes existing members, then inserts new ones.
 */
export async function saveCommittee(
  supabase: SupabaseClient,
  licitacionId: string,
  members: CommitteeMember[]
): Promise<void> {
  // Delete existing committee members
  const { error: deleteError } = await supabase
    .from('licitacion_comision')
    .delete()
    .eq('licitacion_id', licitacionId);

  if (deleteError) {
    throw new Error(`Error al limpiar comision anterior: ${deleteError.message}`);
  }

  if (members.length === 0) return;

  // Insert new members
  const rows = members.map(m => ({
    licitacion_id: licitacionId,
    nombre: m.nombre,
    rut: m.rut ?? null,
    cargo: m.cargo ?? null,
    orden: m.orden,
  }));

  const { error: insertError } = await supabase
    .from('licitacion_comision')
    .insert(rows);

  if (insertError) {
    throw new Error(`Error al guardar comision evaluadora: ${insertError.message}`);
  }
}
