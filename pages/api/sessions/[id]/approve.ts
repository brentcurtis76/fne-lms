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
import { validateFacilitatorIntegrity } from '../../../../lib/utils/facilitator-validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-approve');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden aprobar sesiones', 403);
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
    if (session.status !== 'borrador' && session.status !== 'pendiente_aprobacion') {
      return sendAuthError(
        res,
        `Solo se pueden aprobar sesiones en estado borrador o pendiente_aprobacion. Estado actual: ${session.status}`,
        400
      );
    }

    // Fetch facilitators for this session
    const { data: sessionFacilitators, error: facilitatorError } = await serviceClient
      .from('session_facilitators')
      .select('*')
      .eq('session_id', id);

    if (facilitatorError) {
      console.error('Error fetching session facilitators:', facilitatorError);
      return sendAuthError(res, 'Error al verificar facilitadores de la sesión', 500, facilitatorError.message);
    }

    // Validate facilitator integrity
    const facilitatorValidation = await validateFacilitatorIntegrity(
      serviceClient,
      (sessionFacilitators || []).map(f => ({
        user_id: f.user_id,
        is_lead: f.is_lead,
        facilitator_role: f.facilitator_role,
      })),
      session.school_id
    );

    if (!facilitatorValidation.valid) {
      return sendAuthError(res, `No se puede aprobar la sesión: ${facilitatorValidation.errors.join('; ')}`, 400);
    }

    const previousStatus = session.status;

    // Update session to programada
    const { data: updatedSession, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({
        status: 'programada',
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Database error approving session:', updateError);
      return sendAuthError(res, 'Error al aprobar sesión', 500, updateError.message);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: id as string,
      user_id: user!.id,
      action: 'status_changed',
      details: { old: previousStatus, new: 'programada' },
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
    console.error('Approve session error:', error);
    return sendAuthError(res, 'Error inesperado al aprobar sesión', 500, error.message);
  }
}
