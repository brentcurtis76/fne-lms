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
import {
  isDurationRelevantChange,
  syncRescheduleHours,
} from '../../../../lib/services/hour-tracking';
import { enqueueSessionMeetingSync } from '../../../../lib/zoom/provisioning-intent';
import type { ProvisionSessionRow } from '../../../../lib/zoom/jobs/meeting-provision';
import {
  hasScheduleChanged,
  notifySessionLifecycle,
} from '../../../../lib/services/session-lifecycle-notifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-edit-request-detail');

  const { eid } = req.query;

  if (!eid || typeof eid !== 'string' || !Validators.isUUID(eid)) {
    return sendAuthError(res, 'ID de solicitud de cambio inválido', 400);
  }

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, eid);
    case 'PUT':
      return await handlePut(req, res, eid);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT']);
  }
}

/**
 * GET /api/sessions/edit-requests/[eid]
 * Get single edit request detail (admin only)
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, editRequestId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden ver detalles de solicitudes de cambio', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: editRequest, error: fetchError } = await serviceClient
      .from('session_edit_requests')
      .select(`
        *,
        consultor_sessions(title, session_date, status),
        profiles:requested_by(first_name, last_name, email)
      `)
      .eq('id', editRequestId)
      .single();

    if (fetchError || !editRequest) {
      return sendAuthError(res, 'Solicitud de cambio no encontrada', 404);
    }

    return sendApiResponse(res, { edit_request: editRequest });
  } catch (error: any) {
    console.error('Get edit request detail error:', error);
    return sendAuthError(res, 'Error inesperado al obtener solicitud de cambio', 500, error.message);
  }
}

/**
 * PUT /api/sessions/edit-requests/[eid]
 * Approve or reject edit request (admin only)
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, editRequestId: string) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden revisar solicitudes de cambio', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Validate request body
    const { action, review_notes } = req.body;

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return sendAuthError(res, 'Acción inválida. Use: approve o reject', 400);
    }

    // Fetch edit request with session title
    const { data: editRequest, error: fetchError } = await serviceClient
      .from('session_edit_requests')
      .select('*, consultor_sessions(title)')
      .eq('id', editRequestId)
      .single();

    if (fetchError || !editRequest) {
      return sendAuthError(res, 'Solicitud de cambio no encontrada', 404);
    }

    // Race condition guard: verify status is still pending
    if (editRequest.status !== 'pending') {
      return sendAuthError(
        res,
        `Esta solicitud ya fue procesada con estado: ${editRequest.status}`,
        409
      );
    }

    const sessionId = editRequest.session_id;

    if (action === 'approve') {
      // MUST FIX #1: Update session FIRST, then mark edit request as approved
      // This ensures if session update fails, edit request remains pending for retry

      // Fetch current session to validate it still exists
      const { data: session, error: sessionFetchError } = await serviceClient
        .from('consultor_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionFetchError || !session) {
        return sendAuthError(res, 'Sesión no encontrada', 404);
      }

      // Re-verify old values still match current session (prevent overwriting newer edits)
      const changes = editRequest.changes as Record<string, { old: unknown; new: unknown }>;
      for (const key of Object.keys(changes)) {
        const expectedOld = changes[key].old;
        const currentValue = (session as Record<string, unknown>)[key];
        const normalizedExpected = expectedOld === null ? null : expectedOld;
        const normalizedCurrent = currentValue === null ? null : currentValue;

        if (JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedCurrent)) {
          return sendAuthError(
            res,
            `El valor actual de ${key} ha cambiado desde que se creó la solicitud. La solicitud debe ser rechazada y el consultor debe crear una nueva.`,
            409
          );
        }
      }

      // Build update object from changes
      const sessionUpdate: Record<string, unknown> = {};

      Object.keys(changes).forEach((key) => {
        sessionUpdate[key] = changes[key].new;
      });

      // Fix 5: Revalidate facilitator integrity if school_id is changing
      if (changes['school_id']) {
        // Import validation function
        const { validateFacilitatorIntegrity } = await import('../../../../lib/utils/facilitator-validation');

        // Fetch current session_facilitators
        const { data: facilitators, error: facilitatorError } = await serviceClient
          .from('session_facilitators')
          .select('user_id, is_lead, facilitator_role')
          .eq('session_id', sessionId);

        if (facilitatorError) {
          console.error('Error fetching session facilitators:', facilitatorError);
          return sendAuthError(
            res,
            'Error al validar consultores durante aprobación',
            500,
            facilitatorError.message
          );
        }

        // Get the new school_id from changes
        const newSchoolId = changes['school_id'].new as number;

        // Run validation against NEW school_id with CURRENT facilitators
        const validationResult = await validateFacilitatorIntegrity(
          serviceClient,
          facilitators || [],
          newSchoolId
        );

        if (!validationResult.valid) {
          // Log the blocked approval
          const activityLogEntry: SessionActivityLogInsert = {
            session_id: sessionId,
            user_id: user!.id,
            action: 'edit_approval_blocked',
            details: {
              edit_request_id: editRequestId,
              reason: 'Facilitator integrity validation failed on school change',
              errors: validationResult.errors,
            },
          };

          await serviceClient
            .from('session_activity_log')
            .insert(activityLogEntry);

          return sendAuthError(
            res,
            'No se puede aprobar: los consultores actuales no son válidos para el nuevo colegio. Remedie los consultores primero.',
            409
          );
        }
      }

      // Apply changes to session
      const { error: sessionUpdateError } = await serviceClient
        .from('consultor_sessions')
        .update(sessionUpdate)
        .eq('id', sessionId);

      if (sessionUpdateError) {
        console.error('Database error updating session:', sessionUpdateError);
        return sendAuthError(res, 'Error al aplicar cambios a la sesión', 500, sessionUpdateError.message);
      }

      // Z2-3b (plan §8): the second reschedule path tells Zoom too. Same placement
      // rationale as the admin PUT — after the session update commits, before the
      // hours sync, whose failure path returns 500 over times that already moved.
      //
      // The session row is reconstructed the same way `effectiveStatus` is: this route
      // updates without a `.select()`, so `{ ...session, ...sessionUpdate }` is what the
      // row now holds. The gate and the dedupe key both read from it.
      //
      // With ONE correction. `scheduled_duration_minutes` is a STORED generated column,
      // so the value on `session` is the one computed for the OLD times and the merge
      // cannot recompute it. Nulling it makes the enqueue derive the duration from the
      // new `start_time`/`end_time` — which are the authoritative values here — instead
      // of keying a moved session on the duration it used to have.
      if (isDurationRelevantChange(Object.keys(changes))) {
        await enqueueSessionMeetingSync({
          session: {
            ...session,
            ...sessionUpdate,
            scheduled_duration_minutes: null,
          } as ProvisionSessionRow,
        });
      }

      // Z2-4a (plan §15): the second reschedule path owes the participants the same
      // notice as the admin PUT, gated the same way — on VALUES, so an approved change
      // set that carries a date field holding the date the session already had does not
      // announce a move from a time to itself. This route updates without `.select()`,
      // so the post-update row is `{ ...session, ...sessionUpdate }`, exactly as
      // `effectiveStatus` below reconstructs it.
      {
        const rescheduled = { ...session, ...sessionUpdate };

        if (hasScheduleChanged(session, rescheduled)) {
          await notifySessionLifecycle({
            client: serviceClient,
            session: rescheduled,
            event: 'session_rescheduled',
            req,
            previous: session,
          });
        }
      }

      // Z2-3a (plan §11): an approved edit request is the second reschedule path, and
      // it never touched the ledger either. Same rule as the admin PUT — the hour
      // reservation, the planned snapshot and the revision row move together or not
      // at all. Gated on the status the session HAS after the update, since that is
      // what the RPC reads.
      const effectiveStatus =
        (sessionUpdate.status as string | undefined) ?? (session.status as string);

      if (
        effectiveStatus === 'programada' &&
        isDurationRelevantChange(Object.keys(changes))
      ) {
        const hoursSync = await syncRescheduleHours(serviceClient, sessionId, user!.id);

        if (!hoursSync.ok) {
          // The edit request stays `pending` (it is marked approved only below), so a
          // failed recomputation leaves the request retryable rather than closing it
          // over a stale ledger.
          console.error('Error syncing reschedule hours:', hoursSync.error);
          return sendAuthError(
            res,
            'Los cambios se aplicaron a la sesión, pero no se pudieron recalcular las horas del contrato. Revise el libro de horas antes de continuar.',
            500,
            hoursSync.error
          );
        }
      }

      // Now mark edit request as approved
      const { data: updatedEditRequest, error: updateError } = await serviceClient
        .from('session_edit_requests')
        .update({
          status: 'approved',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || null,
        })
        .eq('id', editRequestId)
        .select('*')
        .single();

      if (updateError) {
        console.error('Database error updating edit request:', updateError);
        // Session was already updated - log this inconsistency
        console.error('CRITICAL: Session was updated but edit request update failed. Manual intervention may be needed.');
        return sendAuthError(res, 'Error al actualizar solicitud de cambio', 500, updateError.message);
      }

      // Insert activity log
      const activityLogEntry: SessionActivityLogInsert = {
        session_id: sessionId,
        user_id: user!.id,
        action: 'edit_approved',
        details: {
          edit_request_id: editRequestId,
          changes_applied: Object.keys(changes),
        },
      };

      const { error: logError } = await serviceClient
        .from('session_activity_log')
        .insert(activityLogEntry);

      if (logError) {
        console.error('Error inserting activity log:', logError);
        // Don't fail the request
      }

      // Notify the requester that their edit was approved
      try {
        const NotificationService = (await import('../../../../lib/notificationService')).default;

        await NotificationService.triggerNotification('session_edit_request_approved', {
          session: {
            id: sessionId,
            title: (editRequest.consultor_sessions as { title: string } | null)?.title || session.title,
          },
          requester_id: editRequest.requested_by,
          changed_fields: Object.keys(changes),
          review_notes: review_notes || null,
        });
      } catch (notifError) {
        console.error('Error sending edit approval notification:', notifError);
      }

      return sendApiResponse(res, { edit_request: updatedEditRequest });
    } else {
      // Reject: only update edit request status
      const { data: updatedEditRequest, error: updateError } = await serviceClient
        .from('session_edit_requests')
        .update({
          status: 'rejected',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || null,
        })
        .eq('id', editRequestId)
        .select('*')
        .single();

      if (updateError) {
        console.error('Database error updating edit request:', updateError);
        return sendAuthError(res, 'Error al rechazar solicitud de cambio', 500, updateError.message);
      }

      // Insert activity log
      const activityLogEntry: SessionActivityLogInsert = {
        session_id: sessionId,
        user_id: user!.id,
        action: 'edit_rejected',
        details: {
          edit_request_id: editRequestId,
          review_notes: review_notes || null,
        },
      };

      const { error: logError } = await serviceClient
        .from('session_activity_log')
        .insert(activityLogEntry);

      if (logError) {
        console.error('Error inserting activity log:', logError);
        // Don't fail the request
      }

      // Notify the requester that their edit was rejected
      try {
        const NotificationService = (await import('../../../../lib/notificationService')).default;

        await NotificationService.triggerNotification('session_edit_request_rejected', {
          session: {
            id: sessionId,
            title: (editRequest.consultor_sessions as { title: string } | null)?.title || '',
          },
          requester_id: editRequest.requested_by,
          review_notes: review_notes || null,
        });
      } catch (notifError) {
        console.error('Error sending edit rejection notification:', notifError);
      }

      return sendApiResponse(res, { edit_request: updatedEditRequest });
    }
  } catch (error: any) {
    console.error('Review edit request error:', error);
    return sendAuthError(res, 'Error inesperado al revisar solicitud de cambio', 500, error.message);
  }
}
