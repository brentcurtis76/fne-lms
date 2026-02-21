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
import { AdvanceStateSchema } from '@/types/licitaciones';
import { advanceState } from '@/lib/licitacionService';
import notificationService from '@/lib/notificationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-advance');

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
      return sendAuthError(res, 'No tiene permisos para avanzar el estado de la licitacion', 403);
    }

    // Fetch licitacion for school scoping
    const { data: licitacion, error: licitError } = await serviceClient
      .from('licitaciones')
      .select('id, school_id, estado')
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

    // Validate request body
    const parseResult = AdvanceStateSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const { target_estado } = parseResult.data;

    // Execute state transition (validates prerequisites in service layer)
    const updated = await advanceState(serviceClient, licitacionId, target_estado, user.id);

    // Fire-and-forget notification based on target estado
    const advanceNotificationMap: Record<string, string> = {
      propuestas_pendientes: 'licitacion_propuestas_open',
      evaluacion_pendiente: 'licitacion_evaluacion_start',
    };
    const notifEventType = advanceNotificationMap[target_estado];
    if (notifEventType) {
      Promise.resolve(
        serviceClient
          .from('schools')
          .select('name')
          .eq('id', updated.school_id)
          .single()
      ).then(({ data: school }) => {
          return notificationService.triggerNotification(notifEventType, {
            licitacion_id: updated.id,
            numero_licitacion: updated.numero_licitacion,
            school_id: updated.school_id,
            school_name: school?.name || '',
          });
        })
        .catch(err => console.error(`Notification trigger failed (${notifEventType}):`, err));
    }

    return sendApiResponse(res, { licitacion: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    // Return business logic errors as 400 (prerequisites), server errors as 500
    const isBizError = message.includes('requisito') || message.includes('transicion') ||
      message.includes('estado') || message.includes('ATE') || message.includes('propuesta');
    return sendAuthError(res, message, isBizError ? 400 : 500);
  }
}
