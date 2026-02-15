import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import { SessionActivityLogInsert } from '../../../../../lib/types/consultor-sessions.types';

type CancelScope = 'all_future' | 'remaining';

interface CancelRequestBody {
  cancellation_reason: string;
  scope: CancelScope;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-series-cancel');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { groupId } = req.query;

  if (!groupId || typeof groupId !== 'string' || !Validators.isUUID(groupId)) {
    return sendAuthError(res, 'ID de grupo inválido', 400);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden cancelar series de sesiones', 403);
  }

  const { cancellation_reason, scope } = req.body as CancelRequestBody;

  // Validate cancellation_reason
  if (!cancellation_reason || typeof cancellation_reason !== 'string' || !cancellation_reason.trim()) {
    return sendAuthError(res, 'Se requiere una razón de cancelación', 400);
  }

  // Validate scope
  if (!scope || (scope !== 'all_future' && scope !== 'remaining')) {
    return sendAuthError(res, 'El alcance debe ser "all_future" o "remaining"', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const now = new Date().toISOString();

    // Build query for sessions to cancel
    let query = serviceClient
      .from('consultor_sessions')
      .select('*')
      .eq('recurrence_group_id', groupId)
      .eq('is_active', true)
      .not('status', 'in', '(completada,cancelada)');

    // Apply date filter for all_future scope
    if (scope === 'all_future') {
      query = query.gte('session_date', today);
    }

    const { data: sessionsToCancel, error: queryError } = await query;

    if (queryError) {
      console.error('Database error fetching sessions to cancel:', queryError);
      return sendAuthError(res, 'Error al obtener sesiones', 500, queryError.message);
    }

    // Return 404 if no eligible sessions found
    if (!sessionsToCancel || sessionsToCancel.length === 0) {
      return sendAuthError(res, 'No se encontraron sesiones elegibles para cancelar', 404);
    }

    const sessionIds = sessionsToCancel.map((s) => s.id);

    // Update all eligible sessions
    const { data: updatedSessions, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({
        status: 'cancelada',
        cancelled_by: user!.id,
        cancelled_at: now,
        cancellation_reason: cancellation_reason.trim(),
      })
      .in('id', sessionIds)
      .select('*');

    if (updateError) {
      console.error('Database error cancelling sessions:', updateError);
      return sendAuthError(res, 'Error al cancelar sesiones', 500, updateError.message);
    }

    // Insert activity log entries for each cancelled session
    const activityLogEntries: SessionActivityLogInsert[] = sessionsToCancel.map((session) => ({
      session_id: session.id,
      user_id: user!.id,
      action: 'cancelled',
      details: {
        old_status: session.status,
        cancellation_reason: cancellation_reason.trim(),
        scope,
        recurrence_group_id: groupId,
      },
    }));

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntries);

    if (logError) {
      console.error('Error inserting activity logs:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, {
      cancelled_count: updatedSessions?.length || 0,
      sessions: updatedSessions || [],
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Series cancel error:', error);
      return sendAuthError(res, 'Error inesperado al cancelar serie', 500, error.message);
    }
    return sendAuthError(res, 'Error inesperado al cancelar serie', 500);
  }
}
