import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { SessionActivityLogInsert } from '../../../lib/types/consultor-sessions.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-bulk-approve');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden aprobar sesiones', 403);
  }

  const { session_ids, recurrence_group_id } = req.body;

  // One of session_ids or recurrence_group_id is required
  if (!session_ids && !recurrence_group_id) {
    return sendAuthError(res, 'Se requiere session_ids o recurrence_group_id', 400);
  }

  if (session_ids && !Array.isArray(session_ids)) {
    return sendAuthError(res, 'session_ids debe ser un array', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();

    let sessionsToApprove: any[] = [];

    // Fetch sessions to approve
    if (recurrence_group_id) {
      const { data, error } = await serviceClient
        .from('consultor_sessions')
        .select('*')
        .eq('recurrence_group_id', recurrence_group_id)
        .in('status', ['borrador', 'pendiente_aprobacion']);

      if (error) {
        console.error('Database error fetching sessions by recurrence_group_id:', error);
        return sendAuthError(res, 'Error al obtener sesiones', 500, error.message);
      }

      sessionsToApprove = data || [];
    } else if (session_ids && session_ids.length > 0) {
      const { data, error } = await serviceClient
        .from('consultor_sessions')
        .select('*')
        .in('id', session_ids)
        .in('status', ['borrador', 'pendiente_aprobacion']);

      if (error) {
        console.error('Database error fetching sessions by ids:', error);
        return sendAuthError(res, 'Error al obtener sesiones', 500, error.message);
      }

      sessionsToApprove = data || [];

      // Report skipped sessions (not found or in non-approvable status)
      if (sessionsToApprove.length < session_ids.length) {
        const foundIds = new Set(sessionsToApprove.map((s: any) => s.id));
        const skippedIds = session_ids.filter((id: string) => !foundIds.has(id));
        if (skippedIds.length > 0) {
          return sendAuthError(
            res,
            `No se pueden aprobar todas las sesiones. ${skippedIds.length} sesión(es) no encontrada(s) o en estado no aprobable.`,
            400
          );
        }
      }
    }

    if (sessionsToApprove.length === 0) {
      return sendAuthError(res, 'No se encontraron sesiones para aprobar', 404);
    }

    const sessionIds = sessionsToApprove.map((s) => s.id);
    const now = new Date().toISOString();

    // Update all sessions to programada
    const { data: updatedSessions, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({
        status: 'programada',
        approved_by: user!.id,
        approved_at: now,
      })
      .in('id', sessionIds)
      .select('*');

    if (updateError) {
      console.error('Database error approving sessions:', updateError);
      return sendAuthError(res, 'Error al aprobar sesiones', 500, updateError.message);
    }

    // Insert activity log entries for all approved sessions
    const activityLogEntries: SessionActivityLogInsert[] = sessionsToApprove.map((session) => ({
      session_id: session.id,
      user_id: user!.id,
      action: 'status_changed',
      details: { old: session.status, new: 'programada' },
    }));

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntries);

    if (logError) {
      console.error('Error inserting activity logs:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, {
      approved_count: updatedSessions?.length || 0,
      sessions: updatedSessions || [],
    });
  } catch (error: any) {
    console.error('Bulk approve error:', error);
    return sendAuthError(res, 'Error inesperado al aprobar sesiones', 500, error.message);
  }
}
