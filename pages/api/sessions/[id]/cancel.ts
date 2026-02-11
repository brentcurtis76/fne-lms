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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-cancel');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden cancelar sesiones', 403);
  }

  const { cancellation_reason } = req.body;

  if (!cancellation_reason || typeof cancellation_reason !== 'string') {
    return sendAuthError(res, 'Se requiere una razon de cancelacion', 400);
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

    // Update session to cancelada
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
      console.error('Database error cancelling session:', updateError);
      return sendAuthError(res, 'Error al cancelar sesión', 500, updateError.message);
    }

    // Cancel all pending notifications
    const { error: notificationError } = await serviceClient
      .from('session_notifications')
      .update({ status: 'cancelled' })
      .eq('session_id', id)
      .eq('status', 'scheduled');

    if (notificationError) {
      console.error('Error cancelling notifications:', notificationError);
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
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { session: updatedSession });
  } catch (error: any) {
    console.error('Cancel session error:', error);
    return sendAuthError(res, 'Error inesperado al cancelar sesión', 500, error.message);
  }
}
