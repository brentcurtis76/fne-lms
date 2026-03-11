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
  logApiRequest(req, 'licitacion-propuestas');

  if (req.method !== 'GET') return handleMethodNotAllowed(res, ['GET']);

  const idParse = uuidSchema.safeParse(req.query.id);
  if (!idParse.success) return sendAuthError(res, 'ID de licitación inválido', 400);
  const licitacionId = idParse.data;

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) return sendAuthError(res, 'No autorizado', 401);

  const serviceClient = createServiceRoleClient();
  const userRoles = await getUserRoles(serviceClient, user.id);
  if (!userRoles.map(r => r.role_type).includes('admin')) {
    return sendAuthError(res, 'Solo administradores pueden acceder', 403);
  }

  try {
    const { data, error: dbError } = await serviceClient
      .from('propuesta_generadas')
      .select('*')
      .eq('licitacion_id', licitacionId)
      .order('version', { ascending: false });

    if (dbError) throw new Error(dbError.message);

    // Attach signed URLs for completed proposals
    const propuestas = await Promise.all(
      (data ?? []).map(async p => {
        if (p.estado === 'completada' && p.archivo_path) {
          try {
            const download_url = await getSignedUrl(p.archivo_path);
            return { ...p, download_url };
          } catch {
            return { ...p, download_url: null };
          }
        }
        return { ...p, download_url: null };
      })
    );

    return sendApiResponse(res, { propuestas });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al obtener propuestas', 500, message);
  }
}
