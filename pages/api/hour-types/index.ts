import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'hour-types');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: hourTypes, error: dbError } = await serviceClient
      .from('hour_types')
      .select('id, key, display_name, modality, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (dbError) {
      return sendAuthError(res, 'Error al obtener tipos de hora', 500, dbError.message);
    }

    return sendApiResponse(res, { hour_types: hourTypes || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener tipos de hora', 500, message);
  }
}
