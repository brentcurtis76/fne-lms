import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  createApiSupabaseClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { uuidSchema } from '@/lib/validation/schemas';
import { calculateTimeline } from '@/lib/licitacionService';
import { z } from 'zod';

const FechaSchema = z.object({
  fecha_publicacion: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'Fecha debe ser formato YYYY-MM-DD'
  ),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'licitaciones-timeline');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { id } = req.query;
  const idParse = uuidSchema.safeParse(id);
  if (!idParse.success) {
    return sendAuthError(res, 'ID de licitacion invalido', 400);
  }

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
      return sendAuthError(res, 'No tiene permisos para acceder a licitaciones', 403);
    }

    const fechaResult = FechaSchema.safeParse(req.query);
    if (!fechaResult.success) {
      return sendAuthError(res, 'Fecha de publicacion requerida (formato YYYY-MM-DD)', 400);
    }

    // Use user-scoped client for holiday fetching — feriados are public SELECT
    const supabaseClient = await createApiSupabaseClient(req, res);
    const timeline = await calculateTimeline(supabaseClient, fechaResult.data.fecha_publicacion);

    return sendApiResponse(res, { timeline });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return sendAuthError(res, 'Error al calcular cronograma', 500, message);
  }
}
