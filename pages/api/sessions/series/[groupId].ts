import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { SessionStatus } from '../../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-series-detail');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { groupId } = req.query;

  if (!groupId || typeof groupId !== 'string' || !Validators.isUUID(groupId)) {
    return sendAuthError(res, 'ID de grupo inválido', 400);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden ver series de sesiones', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Query sessions in the recurrence group
    const { data: sessions, error: queryError } = await serviceClient
      .from('consultor_sessions')
      .select(
        'id, title, session_date, start_time, end_time, status, session_number, recurrence_group_id, schools(name), growth_communities(name), session_facilitators(user_id, is_lead, profiles:profiles(first_name, last_name))'
      )
      .eq('recurrence_group_id', groupId)
      .eq('is_active', true)
      .order('session_number', { ascending: true });

    if (queryError) {
      console.error('Database error fetching series sessions:', queryError);
      return sendAuthError(res, 'Error al obtener sesiones de la serie', 500, queryError.message);
    }

    // Empty group returns 200 with empty array and zero stats (NOT 404)
    if (!sessions || sessions.length === 0) {
      return sendApiResponse(res, {
        recurrence_group_id: groupId,
        total_sessions: 0,
        sessions: [],
        stats: {
          programada: 0,
          completada: 0,
          cancelada: 0,
          borrador: 0,
          pendiente_aprobacion: 0,
          en_progreso: 0,
          pendiente_informe: 0,
        },
      });
    }

    // Compute stats object counting each SessionStatus
    const stats: Record<SessionStatus, number> = {
      borrador: 0,
      pendiente_aprobacion: 0,
      programada: 0,
      en_progreso: 0,
      pendiente_informe: 0,
      completada: 0,
      cancelada: 0,
    };

    sessions.forEach((session) => {
      const status = session.status as SessionStatus;
      if (status in stats) {
        stats[status]++;
      }
    });

    return sendApiResponse(res, {
      recurrence_group_id: groupId,
      total_sessions: sessions.length,
      sessions,
      stats,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Series list error:', error);
      return sendAuthError(res, 'Error inesperado al obtener serie', 500, error.message);
    }
    return sendAuthError(res, 'Error inesperado al obtener serie', 500);
  }
}
