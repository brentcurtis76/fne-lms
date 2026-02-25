import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { SessionActivityLogInsert } from '../../../../lib/types/consultor-sessions.types';
import { completeReservation } from '../../../../lib/services/hour-tracking';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-finalize');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('*, reports:session_reports(id, report_type), attendees:session_attendees(attended)')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Auth check: assigned facilitator only (not admin per Role Access Matrix)
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', id)
      .eq('user_id', user.id)
      .single();

    if (!facilitatorCheck) {
      return sendAuthError(res, 'Solo facilitadores asignados pueden finalizar sesiones', 403);
    }

    // Pre-condition 1: Status must be pendiente_informe
    if (session.status !== 'pendiente_informe') {
      return sendAuthError(
        res,
        `Solo se pueden finalizar sesiones en estado pendiente_informe. Estado actual: ${session.status}`,
        400
      );
    }

    // Pre-condition 2: At least one session_report must exist
    const sessionReports = (session.reports || []).filter((r: { report_type: string }) => r.report_type === 'session_report');
    if (sessionReports.length === 0) {
      return sendAuthError(res, 'Se requiere al menos un informe de sesión antes de finalizar', 400);
    }

    // Pre-condition 3: All attendees must have attended marked (not NULL)
    const attendees = session.attendees || [];
    const unmarkedAttendees = attendees.filter((a: any) => a.attended === null);
    if (unmarkedAttendees.length > 0) {
      return sendAuthError(
        res,
        `Hay ${unmarkedAttendees.length} asistente(s) sin marcar. Debe completar la asistencia antes de finalizar.`,
        400
      );
    }

    const previousStatus = session.status;

    // Compute actual_duration_minutes if null
    const actualDuration = session.actual_duration_minutes ?? session.scheduled_duration_minutes;

    // Hour tracking: mark ledger entry as consumida (non-blocking — legacy sessions will skip)
    await completeReservation(serviceClient, id, user.id);

    // Update session to completada
    const { data: updatedSession, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({
        status: 'completada',
        finalized_by: user.id,
        finalized_at: new Date().toISOString(),
        actual_duration_minutes: actualDuration,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Database error finalizing session:', updateError);
      return sendAuthError(res, 'Error al finalizar sesión', 500, updateError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: id as string,
      user_id: user.id,
      action: 'finalized',
      details: { previous_status: previousStatus },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { session: updatedSession });
  } catch (error: any) {
    console.error('Finalize session error:', error);
    return sendAuthError(res, 'Error inesperado al finalizar sesión', 500, error.message);
  }
}
