import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { getLatestFxRate } from '../../../lib/services/hour-tracking';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'fx-rates-latest');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const result = await getLatestFxRate(serviceClient);

    if (result.error && result.rate_clp_per_eur === 0) {
      return sendAuthError(res, result.error, 503);
    }

    return sendApiResponse(res, {
      rate_clp_per_eur: result.rate_clp_per_eur,
      fetched_at: result.fetched_at,
      is_stale: result.is_stale,
      source: result.source,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener tipo de cambio', 500, message);
  }
}
