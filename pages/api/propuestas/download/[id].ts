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
import { getSignedUrl } from '@/lib/propuestas/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'propuestas-download');

  if (req.method !== 'GET') return handleMethodNotAllowed(res, ['GET']);

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID inválido', 400);
  const propuestaId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden descargar propuestas', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_generadas')
      .select('id, estado, archivo_path, version')
      .eq('id', propuestaId)
      .single();

    if (dbError || !data) return sendAuthError(res, 'Propuesta no encontrada', 404);

    if (data.estado !== 'completada' || !data.archivo_path) {
      return sendAuthError(res, 'La propuesta no está disponible para descarga', 422);
    }

    const download_url = await getSignedUrl(data.archivo_path);
    return sendApiResponse(res, { download_url, propuesta_id: propuestaId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al generar URL de descarga', 500, message);
  }
}
