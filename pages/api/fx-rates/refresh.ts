import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { fetchFxRateFromApi } from '../../../lib/services/hour-tracking';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'fx-rates-refresh');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { isAdmin, error: authError } = await checkIsAdmin(req, res);

  if (authError || !isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden actualizar el tipo de cambio', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const result = await fetchFxRateFromApi(serviceClient);

    return sendApiResponse(res, {
      rate_clp_per_eur: result.rate_clp_per_eur,
      fetched_at: result.fetched_at,
      is_stale: false,
      source: result.source,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error al actualizar tipo de cambio desde API externa', 503, message);
  }
}
