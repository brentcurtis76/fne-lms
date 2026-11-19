/**
 * Confirm Adjudicacion API
 * POST /api/licitaciones/[id]/adjudicacion-confirmar
 *
 * Confirms the adjudicacion, transitioning:
 * - adjudicacion_pendiente → contrato_pendiente (if es_fne = true)
 * - adjudicacion_pendiente → adjudicada_externo (if es_fne = false)
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
import { z } from 'zod';
import { uuidSchema } from '@/lib/validation/schemas';
import { confirmAdjudicacion } from '@/lib/licitacionService';
import notificationService from '@/lib/notificationService';

// The route's own input check: the decision, and the provider selected on the
// screen (optional, so an older client that sends only es_fne still works).
const ConfirmarInputSchema = z.object({
  es_fne: z.boolean(),
  ganador_ate_id: z.string().uuid('UUID invalido').optional(),
});

const GANADOR_NO_GUARDADO =
  'El ganador seleccionado no está guardado. Guarde la adjudicación y vuelva a confirmar.';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-adjudicacion-confirmar');

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
      return sendAuthError(res, 'No tiene permisos para confirmar la adjudicacion', 403);
    }

    // Fetch licitacion for school scoping
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado, ganador_ate_id')
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

    // Validate input
    const parseResult = ConfirmarInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const { es_fne, ganador_ate_id: selectedAteId } = parseResult.data;

    // The award goes only to the provider on the screen: when the client names
    // it, it must be the stored winner (the screen saves before confirming).
    if (selectedAteId !== undefined && selectedAteId !== licitacion.ganador_ate_id) {
      return sendAuthError(res, GANADOR_NO_GUARDADO, 409);
    }

    // Execute confirmation (handles state transition + historial)
    // The service guards its own award update by the selected provider, so a
    // winner saved by someone else after the check above is refused too.
    const updated = await confirmAdjudicacion(serviceClient, licitacionId, es_fne, user.id, selectedAteId);

    // Fire-and-forget notification (async IIFE to allow sequential fetches)
    (async () => {
      try {
        const { data: school } = await serviceClient
          .from('schools')
          .select('name')
          .eq('id', updated.school_id)
          .single();

        let ganadorNombre = '';
        if (updated.ganador_ate_id) {
          const { data: ateRow } = await serviceClient
            .from('licitacion_ates')
            .select('nombre_ate')
            .eq('id', updated.ganador_ate_id)
            .single();
          ganadorNombre = ateRow?.nombre_ate || '';
        }

        await notificationService.triggerNotification('licitacion_adjudicada', {
          licitacion_id: updated.id,
          numero_licitacion: updated.numero_licitacion,
          school_id: updated.school_id,
          school_name: school?.name || '',
          ganador_nombre: ganadorNombre,
        });
      } catch (err) {
        console.error('Notification trigger failed (licitacion_adjudicada):', err);
      }
    })();

    return sendApiResponse(res, { licitacion: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    if (message === GANADOR_NO_GUARDADO) {
      return sendAuthError(res, GANADOR_NO_GUARDADO, 409);
    }
    const isBizError =
      message.includes('estado') || message.includes('ganador') || message.includes('ATE') ||
      message.includes('Carta');
    return sendAuthError(res, message, isBizError ? 400 : 500);
  }
}
