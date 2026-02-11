import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-stats');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden ver estadísticas de sesiones', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data, error } = await serviceClient
      .from('consultor_sessions')
      .select('status');

    if (error) {
      console.error('Database error fetching session stats:', error);
      return sendAuthError(res, 'Error al obtener estadísticas', 500, error.message);
    }

    const sessions = data || [];
    const byStatus: Record<string, number> = {};
    for (const s of sessions) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    }

    return sendApiResponse(res, {
      total: sessions.length,
      by_status: byStatus,
    });
  } catch (error: any) {
    console.error('Session stats error:', error);
    return sendAuthError(res, 'Error inesperado al obtener estadísticas', 500, error.message);
  }
}
