/**
 * Evaluation Scores API
 * GET  /api/licitaciones/[id]/evaluacion — Fetch existing evaluation data
 * POST /api/licitaciones/[id]/evaluacion — Save committee, scores, and montos
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';
import { SaveEvaluationSchema } from '@/types/licitaciones';
import {
  saveEvaluationScores,
  saveCalculatedScores,
  resetCalculatedScores,
  saveCommittee,
  calculateEconomicScores,
  calculateWeightedScores,
  rankATEs,
} from '@/lib/evaluacionService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-evaluacion');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['GET', 'POST']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const roleTypes = userRoles.map(r => r.role_type);
    const isAdmin = roleTypes.includes('admin');
    const isEncargado = roleTypes.includes('encargado_licitacion');

    if (!isAdmin && !isEncargado) {
      return sendAuthError(res, 'No tiene permisos para acceder a evaluaciones', 403);
    }

    // Fetch licitacion
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado, programa_id, peso_evaluacion_tecnica, peso_evaluacion_economica, fecha_evaluacion')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    // School scoping for encargado
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // ============================================================
    // GET — Return existing evaluation data
    // ============================================================
    if (req.method === 'GET') {
      const [comisionRes, scoresRes, atesRes, criteriosRes] = await Promise.all([
        serviceClient
          .from('licitacion_comision')
          .select('*')
          .eq('licitacion_id', licitacionId)
          .order('orden', { ascending: true }),
        serviceClient
          .from('licitacion_evaluaciones')
          .select('*')
          .eq('licitacion_id', licitacionId),
        serviceClient
          .from('licitacion_ates')
          .select('*')
          .eq('licitacion_id', licitacionId)
          .not('propuesta_url', 'is', null),
        serviceClient
          .from('programa_evaluacion_criterios')
          .select('*')
          .eq('programa_id', licitacion.programa_id)
          .eq('is_active', true)
          .order('orden', { ascending: true }),
      ]);

      return sendApiResponse(res, {
        committee: comisionRes.data || [],
        scores: scoresRes.data || [],
        ates: atesRes.data || [],
        criterios: criteriosRes.data || [],
        licitacion_peso_tecnico: licitacion.peso_evaluacion_tecnica,
        licitacion_peso_economico: licitacion.peso_evaluacion_economica,
        fecha_evaluacion: licitacion.fecha_evaluacion ?? null,
      });
    }

    // ============================================================
    // POST — Save evaluation data
    // ============================================================
    // State guard: only allow writes in evaluacion_pendiente
    if (licitacion.estado !== 'evaluacion_pendiente') {
      return sendAuthError(res, 'Solo se puede guardar la evaluacion en estado "evaluacion_pendiente".', 422);
    }

    const parseResult = SaveEvaluationSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const { committee, hora_inicio, hora_fin, fecha_evaluacion, scores, montos } = parseResult.data;

    // N46: every amount must name a provider of THIS tender (with a proposal); checked before anything is written
    const { data: atesData, error: atesError } = await serviceClient
      .from('licitacion_ates')
      .select('id, nombre_ate')
      .eq('licitacion_id', licitacionId)
      .not('propuesta_url', 'is', null);

    if (atesError) {
      throw new Error(`Error al leer las ATEs de la licitacion: ${atesError.message}`);
    }

    const tenderAteIds = new Set((atesData || []).map(a => String(a.id)));
    if (montos.some(m => !tenderAteIds.has(m.ate_id))) {
      return sendAuthError(res, 'Datos invalidos: hay un monto para una ATE que no pertenece a esta licitación.', 400);
    }

    // Save committee — map Zod output to CommitteeMember[]
    const committeeMapped = committee.map(c => ({
      nombre: c.nombre,
      rut: c.rut ?? null,
      cargo: c.cargo ?? null,
      orden: c.orden,
    }));
    await saveCommittee(serviceClient, licitacionId, committeeMapped);

    // Update licitacion with the evaluation date and hours (LIC-B3: the date is printed on the Acta)
    if (hora_inicio || hora_fin || fecha_evaluacion) {
      const updateFields: Record<string, string> = {};
      if (hora_inicio) updateFields.hora_inicio_evaluacion = hora_inicio;
      if (hora_fin) updateFields.hora_fin_evaluacion = hora_fin;
      if (fecha_evaluacion) updateFields.fecha_evaluacion = fecha_evaluacion;
      await serviceClient
        .from('licitaciones')
        .update(updateFields)
        .eq('id', licitacionId);
    }

    // Save evaluation scores — map Zod output to EvaluationScore[]
    if (scores.length > 0) {
      const scoresMapped = scores.map(s => ({
        ate_id: s.ate_id,
        criterio_id: s.criterio_id,
        puntaje: s.puntaje,
        comentario: s.comentario ?? null,
      }));
      await saveEvaluationScores(serviceClient, licitacionId, scoresMapped, user.id);
    }

    const atesWithMontos = montos.filter(m => m.monto_propuesto > 0);

    // LIC-D16: no stale winner. Every provider of the tender is unmarked first, and a provider
    // sent without an amount loses its calculated scores; the winners are then marked from the ranking.
    await resetCalculatedScores(serviceClient, licitacionId, atesWithMontos.map(m => m.ate_id));

    let winnerId: string | null = null;

    // Calculate and save derived scores for the providers sent with an amount
    if (atesWithMontos.length > 0) {
      // Map ate_id → id for calculateEconomicScores
      const atesForCalc = atesWithMontos.map(m => ({ id: m.ate_id, monto_propuesto: m.monto_propuesto }));
      const economicScores = calculateEconomicScores(atesForCalc);

      // Fetch all saved scores to compute technical totals
      const { data: allScores } = await serviceClient
        .from('licitacion_evaluaciones')
        .select('ate_id, puntaje')
        .eq('licitacion_id', licitacionId);

      // Group scores by ate_id
      const techTotals: Record<string, number> = {};
      for (const s of (allScores || [])) {
        techTotals[s.ate_id] = (techTotals[s.ate_id] || 0) + Number(s.puntaje);
      }

      const calculatedAtes = atesWithMontos.map(m => {
        const ecoScore = economicScores.find(e => e.id === m.ate_id)?.puntaje_economico || 0;
        const techScore = techTotals[m.ate_id] || 0;
        const weighted = calculateWeightedScores(
          techScore,
          ecoScore,
          licitacion.peso_evaluacion_tecnica,
          licitacion.peso_evaluacion_economica
        );
        return {
          id: m.ate_id,
          monto_propuesto: m.monto_propuesto,
          puntaje_tecnico: techScore,
          puntaje_economico: ecoScore,
          ...weighted,
          es_ganador: false,
        };
      });

      // Rank ATEs
      const ranked = rankATEs(calculatedAtes.map(a => ({ id: a.id, puntaje_total: a.puntaje_total })));
      const finalAtes = calculatedAtes.map(a => {
        const rank = ranked.find(r => r.id === a.id);
        return { ...a, es_ganador: rank?.es_ganador || false };
      });

      await saveCalculatedScores(serviceClient, licitacionId, finalAtes);

      // A tie at the top is the owner's question (F20, 19 Nov 2026): unchanged, rankATEs marks every
      // top score and the tender's winner is the first of them in the amounts list's order.
      winnerId = finalAtes.find(a => a.es_ganador)?.id ?? null;
    }

    // Update ganador_ate_id on licitacion: the winner, or empty when nobody has an amount
    await serviceClient
      .from('licitaciones')
      .update({ ganador_ate_id: winnerId })
      .eq('id', licitacionId);

    // Log historial
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: 'Evaluacion guardada',
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { scores_count: scores.length, montos_count: montos.length },
      user_id: user.id,
    });

    return sendApiResponse(res, { saved: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al procesar evaluacion', 500, message);
  }
}
