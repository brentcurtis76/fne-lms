import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
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

// POST: an Admin retires a version's public link by hand (LIC-E2). The public
// routes already answer an expired proposal (410).
const LIVE_WEB_STATUSES = ['published', 'viewed'];
const NOT_LIVE_MESSAGE = 'Solo se puede retirar un enlace que está publicado.';

const RetireSchema = z.object({
  propuesta_id: uuidSchema,
  accion: z.literal('retirar'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitacion-propuestas');

  if (req.method !== 'GET' && req.method !== 'POST') return handleMethodNotAllowed(res, ['GET', 'POST']);

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

  if (req.method === 'POST') {
    // A write asks for an admin the way the generation route does: an ACTIVE
    // admin role that does not come from the cached fallback (send-back 1).
    if (!userRoles.some(role => role.role_type === 'admin' && role.is_active === true && !role.from_cache)) {
      return sendAuthError(res, 'Solo administradores pueden acceder', 403);
    }
    return retireLink(req, res, serviceClient, licitacionId);
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

async function retireLink(
  req: NextApiRequest,
  res: NextApiResponse,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  licitacionId: string
) {
  const bodyParse = RetireSchema.safeParse(req.body);
  if (!bodyParse.success) return sendAuthError(res, 'Acción no válida', 400);
  const { propuesta_id } = bodyParse.data;

  try {
    // Only a version of THIS tender can be retired.
    const { data: existing, error: readError } = await serviceClient
      .from('propuesta_generadas')
      .select('id, web_status')
      .eq('id', propuesta_id)
      .eq('licitacion_id', licitacionId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) return sendAuthError(res, 'Propuesta no encontrada', 404);

    // Only a LIVE version can be retired, and the update itself carries that
    // condition: a version still generating, in error or already expired is
    // never written (send-back 1).
    const { data: updated, error: updateError } = await serviceClient
      .from('propuesta_generadas')
      .update({ web_status: 'expired' })
      .eq('id', propuesta_id)
      .eq('licitacion_id', licitacionId)
      .in('web_status', LIVE_WEB_STATUSES)
      .select('id, web_status')
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) return sendAuthError(res, NOT_LIVE_MESSAGE, 409);

    return sendApiResponse(res, { propuesta: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al retirar el enlace', 500, message);
  }
}
