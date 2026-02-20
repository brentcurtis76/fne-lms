/**
 * Adjudicacion Data API
 * POST /api/licitaciones/[id]/adjudicacion
 *
 * Saves adjudicacion details: winner ATE, amount, payment terms, contact.
 * Does NOT advance state — that's handled by adjudicacion-confirmar.ts
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
import { AdjudicacionSchema } from '@/types/licitaciones';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-adjudicacion');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
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
      return sendAuthError(res, 'No tiene permisos para guardar adjudicacion', 403);
    }

    // Fetch licitacion
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado')
      .eq('id', licitacionId)
      .single();

    if (licitError || !licitacion) {
      return sendAuthError(res, 'Licitacion no encontrada', 404);
    }

    if (licitacion.estado !== 'adjudicacion_pendiente') {
      return sendAuthError(
        res,
        `Los datos de adjudicacion solo pueden guardarse en estado "adjudicacion_pendiente". Estado actual: "${licitacion.estado}".`,
        422
      );
    }

    // School scoping for encargado
    if (!isAdmin && isEncargado) {
      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    // Validate input
    const parseResult = AdjudicacionSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const data = parseResult.data;

    // Verify the ganador ATE belongs to this licitacion
    const { data: ateCheck } = await serviceClient
      .from('licitacion_ates')
      .select('id')
      .eq('id', data.ganador_ate_id)
      .eq('licitacion_id', licitacionId)
      .single();

    if (!ateCheck) {
      return sendAuthError(res, 'El ATE ganador no pertenece a esta licitacion', 400);
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      ganador_ate_id: data.ganador_ate_id,
    };
    if (data.monto_adjudicado_uf !== undefined) updatePayload.monto_adjudicado_uf = data.monto_adjudicado_uf;
    if (data.condiciones_pago !== undefined) updatePayload.condiciones_pago = data.condiciones_pago;
    if (data.fecha_oferta_ganadora !== undefined) updatePayload.fecha_oferta_ganadora = data.fecha_oferta_ganadora;
    if (data.contacto_coordinacion_nombre !== undefined) updatePayload.contacto_coordinacion_nombre = data.contacto_coordinacion_nombre;
    if (data.contacto_coordinacion_email !== undefined) updatePayload.contacto_coordinacion_email = data.contacto_coordinacion_email;
    if (data.contacto_coordinacion_telefono !== undefined) updatePayload.contacto_coordinacion_telefono = data.contacto_coordinacion_telefono;

    // Update licitacion
    const { data: updated, error: updateError } = await serviceClient
      .from('licitaciones')
      .update(updatePayload)
      .eq('id', licitacionId)
      .select('*')
      .single();

    if (updateError || !updated) {
      return sendAuthError(res, `Error al guardar adjudicacion: ${updateError?.message || 'Error desconocido'}`, 500);
    }

    // Update es_ganador on all ATEs (reset then set winner)
    await serviceClient
      .from('licitacion_ates')
      .update({ es_ganador: false })
      .eq('licitacion_id', licitacionId);

    await serviceClient
      .from('licitacion_ates')
      .update({ es_ganador: true })
      .eq('id', data.ganador_ate_id);

    // Historial
    await serviceClient.from('licitacion_historial').insert({
      licitacion_id: licitacionId,
      accion: 'Datos de adjudicacion guardados',
      estado_anterior: licitacion.estado,
      estado_nuevo: licitacion.estado,
      detalles: { ganador_ate_id: data.ganador_ate_id },
      user_id: user.id,
    });

    return sendApiResponse(res, { licitacion: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al guardar adjudicacion', 500, message);
  }
}
