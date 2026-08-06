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
import { createReservation } from '../../../../lib/services/hour-tracking';
import { enqueueSessionProvision } from '../../../../lib/zoom/provisioning-intent';
import { notifySessionLifecycle } from '../../../../lib/services/session-lifecycle-notifications';

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

    // Hour tracking: create reservation ledger entry before status update
    const reservationResult = await createReservation(serviceClient, session, user!.id);

    if (!reservationResult.skipped && reservationResult.error) {
      return sendAuthError(res, reservationResult.error, 400);
    }

    // Hoisted, not inlined: the Zoom provisioning dedupe key below is built from the
    // exact `approved_at` this route writes (see `provisionDedupeKey`).
    const approvedAt = new Date().toISOString();

    // Update session to programada
    const { data: updatedSession, error: updateError } = await serviceClient
      .from('consultor_sessions')
      .update({
        status: 'programada',
        approved_by: user!.id,
        approved_at: approvedAt,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Database error approving session:', updateError);

      // Compensating action: remove orphaned ledger entry
      if (!reservationResult.skipped && reservationResult.ledger_entry_id) {
        await serviceClient
          .from('contract_hours_ledger')
          .delete()
          .eq('id', reservationResult.ledger_entry_id);
      }

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

    // Zoom plan §8: approval enqueues the meeting provisioning job, and NEVER fails
    // because of Zoom. `enqueueSessionProvision` gates on the §14 flags plus source-state
    // eligibility and swallows its own errors, so the response below is byte-identical
    // whether the job was enqueued, deduped, gated off, or errored.
    await enqueueSessionProvision({ session: updatedSession, approvedAt });

    // Z2-4a (plan §15): approval — not creation — is when a session becomes real to its
    // participants. `pages/api/sessions/index.ts:225` creates every session as
    // `borrador`, which is not participant-visible, so `session_created` belongs here.
    // Emitted after the update commits, and it can neither throw nor change the response.
    await notifySessionLifecycle({
      client: serviceClient,
      session: updatedSession,
      event: 'session_created',
      req,
    });

    return sendApiResponse(res, { session: updatedSession });
  } catch (error: any) {
    console.error('Approve session error:', error);
    return sendAuthError(res, 'Error inesperado al aprobar sesión', 500, error.message);
  }
}
