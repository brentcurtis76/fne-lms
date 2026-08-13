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
import { validateFacilitatorIntegrity } from '../../../lib/utils/facilitator-validation';
import {
  createReservation,
  HOUR_AVAILABILITY_ERROR_ES,
  prepareReservation,
  type ReservationPreparation,
} from '../../../lib/services/hour-tracking';
import { enqueueSessionProvision } from '../../../lib/zoom/provisioning-intent';
import { notifySessionLifecycle } from '../../../lib/services/session-lifecycle-notifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-bulk-approve');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'No autenticado', 401);
  }
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

    // Fetch all facilitators for these sessions in one query (performance optimization)
    const { data: allFacilitators, error: facilitatorsFetchError } = await serviceClient
      .from('session_facilitators')
      .select('*')
      .in('session_id', sessionIds);

    if (facilitatorsFetchError) {
      console.error('Error fetching session facilitators:', facilitatorsFetchError);
      return sendAuthError(res, 'Error al verificar facilitadores de sesiones', 500, facilitatorsFetchError.message);
    }

    // Group facilitators by session_id for validation
    const facilitatorsBySession = new Map<string, any[]>();
    for (const fac of (allFacilitators || [])) {
      if (!facilitatorsBySession.has(fac.session_id)) {
        facilitatorsBySession.set(fac.session_id, []);
      }
      facilitatorsBySession.get(fac.session_id)!.push(fac);
    }

    // Validate facilitators for each session (atomic: if any fails, reject all)
    const validationErrors: string[] = [];
    for (const session of sessionsToApprove) {
      const sessionFacilitators = facilitatorsBySession.get(session.id) || [];
      const validation = await validateFacilitatorIntegrity(
        serviceClient,
        sessionFacilitators.map(f => ({
          user_id: f.user_id,
          is_lead: f.is_lead,
          facilitator_role: f.facilitator_role,
        })),
        session.school_id
      );

      if (!validation.valid) {
        validationErrors.push(`Sesión ${session.id}: ${validation.errors.join('; ')}`);
      }
    }

    if (validationErrors.length > 0) {
      return sendAuthError(
        res,
        `No se pueden aprobar las sesiones: ${validationErrors.join(' | ')}`,
        400
      );
    }

    // Resolve every financial dependency for the WHOLE batch before the first
    // ledger write. Otherwise an RPC outage on session N would leave sessions
    // 1..N-1 reserved even though the approval returns an error.
    const preparations: ReservationPreparation[] = [];
    const preparationErrors: string[] = [];
    for (const session of sessionsToApprove) {
      const preparation = await prepareReservation(serviceClient, session);
      preparations.push(preparation);
      if (preparation.kind === 'error') {
        if (preparation.error_kind === 'dependency') {
          return sendAuthError(res, HOUR_AVAILABILITY_ERROR_ES, 500);
        }
        preparationErrors.push(`Sesión ${session.id}: ${preparation.error}`);
      }
    }

    if (preparationErrors.length > 0) {
      return sendAuthError(
        res,
        `No se pueden aprobar las sesiones: ${preparationErrors.join(' | ')}`,
        400
      );
    }

    // Preflight intentionally performs no ledger writes, so repeated sessions for
    // one allocation see the same pre-batch balance. Debit that balance in memory
    // in source order to preserve the sequential over-budget semantics without
    // reopening the partial-write failure window.
    const preparedHoursByAllocation = new Map<string, number>();
    for (const preparation of preparations) {
      if (preparation.kind !== 'ready') continue;
      const priorHours = preparedHoursByAllocation.get(preparation.allocation.id) ?? 0;
      preparation.isOverBudget =
        preparation.isOverBudget || preparation.availableHours - priorHours < preparation.hours;
      preparedHoursByAllocation.set(preparation.allocation.id, priorHours + preparation.hours);
    }

    // Hour tracking: all availability reads are already known-good; create the
    // reservation rows without re-querying the RPC.
    const reservationErrors: string[] = [];
    for (const [index, session] of sessionsToApprove.entries()) {
      const reservationResult = await createReservation(
        serviceClient,
        session,
        user!.id,
        preparations[index]
      );
      if (!reservationResult.skipped && reservationResult.error) {
        reservationErrors.push(`Sesión ${session.id}: ${reservationResult.error}`);
      }
    }

    if (reservationErrors.length > 0) {
      return sendAuthError(
        res,
        `No se pueden aprobar las sesiones: ${reservationErrors.join(' | ')}`,
        400
      );
    }

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

    // Zoom plan §8, same contract as the single-session route: one gated, deduped
    // `meeting_provision` job per approved session, and the response is unaffected by
    // every possible Zoom outcome. Sequential rather than `Promise.all` so a batch never
    // opens N concurrent writes against the queue.
    for (const session of updatedSessions || []) {
      await enqueueSessionProvision({ session, approvedAt: now });
    }

    // Z2-4a (plan §15): same rule as the single-session route — one `session_created`
    // per session this batch actually approved, to that session's own participants.
    // Iterated because the recipient set is per-session; none of these can throw.
    for (const session of updatedSessions || []) {
      await notifySessionLifecycle({
        client: serviceClient,
        session,
        event: 'session_created',
        req,
      });
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
