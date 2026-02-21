/**
 * Generate Acta de Reunion API
 * GET /api/licitaciones/[id]/generate-acta
 *
 * Generates an Acta de Reunion .docx and stores it in Supabase storage.
 * State must be evaluacion_pendiente or adjudicacion_pendiente.
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
import { generateActaDocument } from '@/lib/actaGenerator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-generate-acta');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
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
      return sendAuthError(res, 'No tiene permisos para generar el Acta', 403);
    }

    // Fetch licitacion
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('*')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    // School scoping for encargado (must be checked before state to avoid leaking state info)
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // State check
    if (licitacion.estado !== 'evaluacion_pendiente' && licitacion.estado !== 'adjudicacion_pendiente') {
      return sendAuthError(
        res,
        `El Acta solo puede generarse en estado "evaluacion_pendiente" o "adjudicacion_pendiente". Estado actual: "${licitacion.estado}".`,
        422
      );
    }

    // Fetch committee
    const { data: committee } = await serviceClient
      .from('licitacion_comision')
      .select('*')
      .eq('licitacion_id', licitacionId)
      .order('orden', { ascending: true });

    if (!committee || committee.length === 0) {
      return sendAuthError(res, 'Debe registrar los miembros de la comision evaluadora antes de generar el Acta.', 422);
    }

    // Fetch ATEs with proposals
    const { data: atesData } = await serviceClient
      .from('licitacion_ates')
      .select('*')
      .eq('licitacion_id', licitacionId)
      .not('propuesta_url', 'is', null);

    if (!atesData || atesData.length === 0) {
      return sendAuthError(res, 'No hay ATEs con propuestas para incluir en el Acta.', 422);
    }

    // Fetch criterios
    const { data: criteriosData } = await serviceClient
      .from('programa_evaluacion_criterios')
      .select('*')
      .eq('programa_id', licitacion.programa_id)
      .eq('is_active', true)
      .order('orden', { ascending: true });

    // Fetch scores
    const { data: scoresData } = await serviceClient
      .from('licitacion_evaluaciones')
      .select('ate_id, criterio_id, puntaje')
      .eq('licitacion_id', licitacionId);

    // Build scoresByAte map: ate_id -> criterio_id -> puntaje
    const scoresByAte: Record<string, Record<string, number>> = {};
    for (const s of (scoresData || [])) {
      if (!scoresByAte[s.ate_id]) scoresByAte[s.ate_id] = {};
      scoresByAte[s.ate_id][s.criterio_id] = Number(s.puntaje);
    }

    // Build ATEs data for generator
    const ates = atesData.map(ate => ({
      id: ate.id,
      nombre_ate: ate.nombre_ate,
      rut_ate: ate.rut_ate as string | null,
      puntaje_total: Number(ate.puntaje_total) || 0,
      puntaje_tecnico: Number(ate.puntaje_tecnico) || 0,
      puntaje_economico: Number(ate.puntaje_economico) || 0,
      puntaje_tecnico_ponderado: Number(ate.puntaje_tecnico_ponderado) || 0,
      puntaje_economico_ponderado: Number(ate.puntaje_economico_ponderado) || 0,
      monto_propuesto: Number(ate.monto_propuesto) || 0,
      es_ganador: Boolean(ate.es_ganador),
    }));

    const criterios = (criteriosData || []).map(c => ({
      id: c.id,
      nombre_criterio: String(c.nombre_criterio),
      puntaje_maximo: Number(c.puntaje_maximo),
      orden: Number(c.orden),
    }));

    const today = new Date().toISOString().split('T')[0];

    const docBuffer = await generateActaDocument({
      licitacion: {
        nombre_licitacion: licitacion.nombre_licitacion,
        numero_licitacion: licitacion.numero_licitacion,
        peso_evaluacion_tecnica: licitacion.peso_evaluacion_tecnica,
        peso_evaluacion_economica: licitacion.peso_evaluacion_economica,
      },
      fechaEvaluacion: today,
      horaInicio: licitacion.hora_inicio_evaluacion || '09:00',
      horaFin: licitacion.hora_fin_evaluacion || '12:00',
      committee: committee.map(m => ({
        nombre: String(m.nombre),
        rut: m.rut as string | null,
        cargo: m.cargo as string | null,
        orden: Number(m.orden),
      })),
      ates,
      criterios,
      scoresByAte,
    });

    // Build storage path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const safeNumero = licitacion.numero_licitacion.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `${timestamp}_${safeNumero}_acta-reunion.docx`;
    const storagePath = `licitaciones/${licitacionId}/evaluacion/${filename}`;

    // Upload to storage
    const { error: uploadError } = await serviceClient.storage
      .from('licitaciones')
      .upload(storagePath, docBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      return sendAuthError(res, 'Error al almacenar el Acta generada', 500, uploadError.message);
    }

    // Insert licitacion_documentos record
    const { data: docRecord, error: docInsertError } = await serviceClient
      .from('licitacion_documentos')
      .insert({
        licitacion_id: licitacionId,
        tipo: 'evaluacion_generada',
        nombre: `Acta de Reunion ${licitacion.numero_licitacion} — ${filename}`,
        storage_path: storagePath,
        file_name: filename,
        file_size: docBuffer.length,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploaded_by: user.id,
      })
      .select('*')
      .single();

    if (docInsertError) {
      await serviceClient.storage.from('licitaciones').remove([storagePath]);
      return sendAuthError(res, 'Error al registrar el Acta generada', 500, docInsertError.message);
    }

    // Historial
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: 'Acta de Reunion generada',
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { file_name: filename, storage_path: storagePath },
      user_id: user.id,
    });

    // Signed URL (1 hour)
    const { data: signedUrlData } = await serviceClient.storage
      .from('licitaciones')
      .createSignedUrl(storagePath, 3600);

    return sendApiResponse(res, {
      documento: docRecord,
      url: signedUrlData?.signedUrl || null,
      filename,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al generar el Acta de Reunion', 500, message);
  }
}
