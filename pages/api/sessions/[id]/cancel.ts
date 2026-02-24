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
import { SessionActivityLogInsert } from '../../../../lib/types/consultor-sessions.types';
import { executeCancellation, evaluateCancellationClause, calculateNoticeHours } from '../../../../lib/services/hour-tracking';
import { CancelledByParty } from '../../../../lib/types/hour-tracking.types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-cancel');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  const { isAdmin, user } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden cancelar sesiones', 403);
  }

  const {
    cancellation_reason,
    cancelled_by,
    is_force_majeure,
    admin_override_status,
    admin_override_reason,
  } = req.body;

  if (!cancellation_reason || typeof cancellation_reason !== 'string') {
    return sendAuthError(res, 'Se requiere una razon de cancelacion', 400);
  }

  if (cancellation_reason.length > 1000) {
    return sendAuthError(res, 'La razón de cancelación no puede exceder 1000 caracteres', 400);
  }

  // Validate cancelled_by if provided (extended cancellation)
  const validCancelledByValues: CancelledByParty[] = ['school', 'fne', 'force_majeure'];
  if (cancelled_by && !validCancelledByValues.includes(cancelled_by as CancelledByParty)) {
    return sendAuthError(res, 'Valor de cancelled_by inválido. Debe ser: school, fne o force_majeure', 400);
  }

  // Validate admin_override_status enum
  const validOverrideStatuses = ['devuelta', 'penalizada'];
  if (admin_override_status && !validOverrideStatuses.includes(admin_override_status)) {
    return sendAuthError(res, 'admin_override_status debe ser devuelta o penalizada', 400);
  }

  // Admin override requires reason
  if (admin_override_status && !admin_override_reason) {
    return sendAuthError(res, 'Se requiere una razón para la anulación administrativa', 400);
  }

  if (admin_override_reason && typeof admin_override_reason === 'string' && admin_override_reason.length > 500) {
    return sendAuthError(res, 'La razón de anulación no puede exceder 500 caracteres', 400);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Validate current status
    if (session.status === 'completada') {
      return sendAuthError(res, 'No se puede cancelar una sesion ya completada', 400);
    }

    const previousStatus = session.status;

    // If extended cancellation fields are provided, use hour tracking logic
    if (cancelled_by && session.hour_type_key && session.contrato_id) {
      const cancellationResult = await executeCancellation(
        serviceClient,
        session,
        {
          cancelled_by_party: (is_force_majeure ? 'force_majeure' : cancelled_by) as CancelledByParty,
          reason: cancellation_reason.trim(),
          is_force_majeure: !!is_force_majeure,
          admin_override_status: admin_override_status as 'devuelta' | 'penalizada' | undefined,
          admin_override_reason: admin_override_reason as string | undefined,
        },
        user!.id
      );

      if (!cancellationResult.success) {
        return sendAuthError(res, cancellationResult.error || 'Error al cancelar sesión', 500);
      }

      // Fetch updated session
      const { data: updatedSession } = await serviceClient
        .from('consultor_sessions')
        .select('*')
        .eq('id', id)
        .single();

      // Cancel all pending notifications
      await serviceClient
        .from('session_notifications')
        .update({ status: 'cancelled' })
        .eq('session_id', id)
        .eq('status', 'scheduled');

      // Insert activity log
      const activityLogEntry: SessionActivityLogInsert = {
        session_id: id as string,
        user_id: user!.id,
        action: 'cancelled',
        details: {
          reason: cancellation_reason.trim(),
          previous_status: previousStatus,
          cancelled_by_party: cancelled_by,
          clause: cancellationResult.clause_result?.clause,
          ledger_status: cancellationResult.clause_result?.ledger_status,
          is_admin_override: !!admin_override_status,
        },
      };

      await serviceClient.from('session_activity_log').insert(activityLogEntry);

      return sendApiResponse(res, {
        session: updatedSession,
        clause_result: cancellationResult.clause_result,
        cancelled_notice_hours: cancellationResult.cancelled_notice_hours,
      });
    }

    // Legacy path: simple cancel without hour tracking
    const { data: updatedSession, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({
        status: 'cancelada',
        cancelled_by: user!.id,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellation_reason.trim(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      return sendAuthError(res, 'Error al cancelar sesión', 500, updateError.message);
    }

    // Cancel all pending notifications
    const { error: notificationError } = await serviceClient
      .from('session_notifications')
      .update({ status: 'cancelled' })
      .eq('session_id', id)
      .eq('status', 'scheduled');

    if (notificationError) {
      // Don't fail the request
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: id as string,
      user_id: user!.id,
      action: 'cancelled',
      details: {
        reason: cancellation_reason.trim(),
        previous_status: previousStatus,
      },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      // Don't fail the request
    }

    // If session has hour tracking but no cancelled_by party provided,
    // calculate clause for informational purposes
    let clauseInfo = null;
    if (session.hour_type_key && session.contrato_id && session.session_date) {
      const noticeHours = calculateNoticeHours(
        session.session_date,
        session.start_time || '00:00'
      );
      clauseInfo = evaluateCancellationClause(session.modality, 'school', noticeHours);
    }

    return sendApiResponse(res, {
      session: updatedSession,
      clause_result: clauseInfo,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al cancelar sesión', 500, message);
  }
}
