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
import { PublicacionSchema } from '@/types/licitaciones';
import { confirmPublicacion } from '@/lib/licitacionService';
import { uuidSchema } from '@/lib/validation/schemas';
import notificationService from '@/lib/notificationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-publicacion');

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
      return sendAuthError(res, 'No tiene permisos para confirmar publicaciones', 403);
    }

    // For encargados, verify they belong to this licitacion's school
    if (!isAdmin && isEncargado) {
      const { data: licitacion, error: licitError } = await serviceClient
        .from('licitaciones')
        .select('school_id')
        .eq('id', licitacionId)
        .single();

      if (licitError || !licitacion) {
        return sendAuthError(res, 'Licitacion no encontrada', 404);
      }

      const encargadoRole = userRoles.find(r => r.role_type === 'encargado_licitacion');
      const encargadoSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
      if (!encargadoRole || encargadoSchoolId !== licitacion.school_id) {
        return sendAuthError(res, 'No tiene permisos para esta licitacion', 403);
      }
    }

    const parseResult = PublicacionSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return sendAuthError(res, `Datos invalidos: ${errors}`, 400);
    }

    const updated = await confirmPublicacion(
      serviceClient,
      licitacionId,
      parseResult.data,
      user.id
    );

    // Fire-and-forget notification
    Promise.resolve(
      serviceClient
        .from('schools')
        .select('name')
        .eq('id', updated.school_id)
        .single()
    ).then(({ data: school }) => {
        return notificationService.triggerNotification('licitacion_published', {
          licitacion_id: updated.id,
          numero_licitacion: updated.numero_licitacion,
          school_id: updated.school_id,
          school_name: school?.name || '',
          fecha_publicacion: updated.fecha_publicacion || '',
        });
      })
      .catch(err => console.error('Notification trigger failed (licitacion_published):', err));

    return sendApiResponse(res, { licitacion: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    const userMessage = message.includes('publicacion') || message.includes('estado')
      ? message : 'Error al confirmar publicación';
    return sendAuthError(res, userMessage, 400, message);
  }
}
