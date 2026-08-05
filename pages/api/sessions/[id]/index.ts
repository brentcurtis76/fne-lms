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
import {
  SessionWithRelations,
  SessionActivityLogInsert,
  STRUCTURAL_FIELDS,
} from '../../../../lib/types/consultor-sessions.types';
import {
  isDurationRelevantChange,
  syncRescheduleHours,
} from '../../../../lib/services/hour-tracking';
import {
  enqueueSessionMeetingDelete,
  enqueueSessionMeetingSync,
} from '../../../../lib/zoom/provisioning-intent';
import { canViewSession, SessionAccessContext } from '../../../../lib/utils/session-policy';
import { sendSessionNotFound } from '../../../../lib/utils/session-denials';
import {
  applySessionMeetingDisclosure,
  canViewParticipantEmails,
  filterReportsByVisibility,
  redactProfileEmails,
} from '../../../../lib/utils/session-disclosure';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-detail');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  switch (req.method) {
    case 'GET':
      return await handleGet(req, res, id);
    case 'PUT':
      return await handlePut(req, res, id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'PUT']);
  }
}

/**
 * GET /api/sessions/[id]
 * Fetch session detail with all relations
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Determine user role first (needed for is_active bypass)
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Fetch session with school and growth community names
    // Admins can access inactive sessions; all others require is_active = true
    let sessionQuery = serviceClient
      .from('consultor_sessions')
      .select('*, schools!consultor_sessions_school_id_fkey(name), growth_communities(name)')
      .eq('id', sessionId);

    if (highestRole !== 'admin') {
      sessionQuery = sessionQuery.eq('is_active', true);
    }

    const { data: session, error: sessionError } = await sessionQuery.single();

    if (sessionError || !session) {
      return sendSessionNotFound(res);
    }

    // Facilitator membership feeds the access context: it drives view access,
    // report visibility and e-mail disclosure alike.
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Authorization via the canonical policy helper — same context the sibling
    // endpoints (reports/materials/attendees) build. Do NOT reintroduce an
    // inline role check here: the previous one granted GC access on any
    // community_id match, ignoring is_active.
    const accessContext: SessionAccessContext = {
      highestRole,
      userRoles,
      session: {
        id: session.id,
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        status: session.status,
      },
      userId: user.id,
      isFacilitator: !!facilitatorCheck,
    };

    // Denied views are indistinguishable from a missing session — see
    // `sendSessionNotFound`. Do NOT restore a 403 here: the status difference
    // alone is an existence oracle.
    if (!canViewSession(accessContext)) {
      return sendSessionNotFound(res);
    }

    // Check if activity_log should be included (exact match whitelist)
    const include = req.query.include as string | undefined;
    const VALID_INCLUDES = ['activity_log'];
    const includeActivityLog = include ? VALID_INCLUDES.includes(include) : false;

    // Fetch all relations in parallel
    const [facilitatorsRes, attendeesRes, reportsRes, materialsRes, communicationsRes, activityLogRes, editRequestsRes] =
      await Promise.all([
        serviceClient
          .from('session_facilitators')
          .select('*, profiles(id, first_name, last_name, email)')
          .eq('session_id', sessionId),
        serviceClient.from('session_attendees').select('*, profiles:user_id(id, first_name, last_name, email)').eq('session_id', sessionId),
        serviceClient.from('session_reports').select('*').eq('session_id', sessionId),
        serviceClient.from('session_materials').select('*, profiles:uploaded_by(first_name, last_name, email)').eq('session_id', sessionId),
        serviceClient.from('session_communications').select('*').eq('session_id', sessionId),
        includeActivityLog
          ? serviceClient
              .from('session_activity_log')
              .select('*, profiles:user_id(first_name, last_name)')
              .eq('session_id', sessionId)
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: null }),
        serviceClient
          .from('session_edit_requests')
          .select('*, profiles:requested_by(first_name, last_name)')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false }),
      ]);

    // Personal e-mails only for admins, school-scoped consultors and this
    // session's facilitators. Everyone else gets names only.
    const showEmails = canViewParticipantEmails(accessContext);
    const redact = <T>(rows: T[]): T[] => (showEmails ? rows : redactProfileEmails(rows));

    // Raw meeting link → admins / facilitators / scoped consultors only.
    // Transcript → admins / facilitators only. Everyone gets has_meeting +
    // join_path and reaches the meeting through /meet/session/{id}.
    const disclosedSession = applySessionMeetingDisclosure(session, accessContext);

    const sessionWithRelations: SessionWithRelations = {
      ...disclosedSession,
      facilitators: redact(facilitatorsRes.data || []),
      attendees: redact(attendeesRes.data || []),
      // Same rule as GET /api/sessions/[id]/reports — shared helper so the two
      // sites cannot drift.
      reports: filterReportsByVisibility(reportsRes.data || [], accessContext),
      materials: redact(materialsRes.data || []),
      communications: communicationsRes.data || [],
      ...(activityLogRes.data && { activity_log: activityLogRes.data }),
      edit_requests: editRequestsRes.data || [],
    };

    return sendApiResponse(res, { session: sessionWithRelations });
  } catch (error: any) {
    console.error('Get session detail error:', error);
    return sendAuthError(res, 'Error inesperado al obtener sesión', 500, error.message);
  }
}

/**
 * PUT /api/sessions/[id]
 * Update session (admin: all fields, consultant: non-structural only)
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Determine user role first (needed for is_active bypass)
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Fetch session — admins can update inactive sessions; others require is_active
    let sessionQuery = serviceClient
      .from('consultor_sessions')
      .select('*')
      .eq('id', sessionId);

    if (highestRole !== 'admin') {
      sessionQuery = sessionQuery.eq('is_active', true);
    }

    const { data: session, error: sessionError } = await sessionQuery.single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    let isAdmin = false;
    let isAssignedConsultant = false;

    if (highestRole === 'admin') {
      isAdmin = true;
    } else if (highestRole === 'consultor') {
      // Check if user is an assigned facilitator
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        isAssignedConsultant = true;
      }
    }

    if (!isAdmin && !isAssignedConsultant) {
      return sendAuthError(res, 'No tiene permisos para editar esta sesión', 403);
    }

    // Consultant: check for structural fields
    if (isAssignedConsultant && !isAdmin) {
      const updateKeys = Object.keys(req.body);
      const structuralFieldsAttempted = updateKeys.filter((key) =>
        STRUCTURAL_FIELDS.includes(key as any)
      );

      if (structuralFieldsAttempted.length > 0) {
        return sendAuthError(
          res,
          'Los consultores no pueden modificar campos estructurales. Use solicitudes de edicion para cambios de fecha, hora o comunidad.',
          403
        );
      }
    }

    // ---------------------------------------------------------------------
    // Zoom plan §8 — the managed-meeting guard.
    //
    // Keyed on the STORED `is_zoom_managed`, never on the projection row: intent is
    // durable and exists before any meeting does. Three invariants, in order of how
    // early they can be decided.
    // ---------------------------------------------------------------------
    const managedIntentAttempted = req.body.is_zoom_managed !== undefined;

    // Managed intent is admin-only, same shape as the structural-field rule above.
    if (managedIntentAttempted && !isAdmin) {
      return sendAuthError(
        res,
        'Los consultores no pueden activar ni desactivar la reunión Zoom gestionada por la plataforma.',
        403
      );
    }

    // The column is NOT NULL — reject a non-boolean here rather than letting Postgres
    // turn it into a 500.
    if (managedIntentAttempted && typeof req.body.is_zoom_managed !== 'boolean') {
      return sendAuthError(res, 'is_zoom_managed debe ser un booleano', 400);
    }

    if (session.is_zoom_managed === true) {
      // The link is owned by the provisioner. Clearing it is not this route's business
      // either, but it is at least not a rival link — only a non-null write is rejected.
      if (req.body.meeting_link !== undefined && req.body.meeting_link !== null) {
        return res.status(409).json({
          error:
            'Esta sesión usa una reunión Zoom gestionada por la plataforma; el enlace no se edita manualmente.',
          code: 'ZOOM_MANAGED_SESSION',
        });
      }

      // Same invariant wearing a different hat: moving the provider off 'zoom' would
      // orphan a meeting the platform still owns.
      if (req.body.meeting_provider !== undefined && req.body.meeting_provider !== 'zoom') {
        return res.status(409).json({
          error:
            'Esta sesión usa una reunión Zoom gestionada por la plataforma; el proveedor no se puede cambiar.',
          code: 'ZOOM_MANAGED_SESSION',
        });
      }
    }

    // Intent may only be set while the session is still pre-approval. After approval a
    // meeting may already exist, and unmanaging it requires the `meeting_delete` sync
    // that does not exist yet — so the flag is frozen rather than silently leaking a
    // meeting nobody owns.
    if (
      managedIntentAttempted &&
      session.status !== 'borrador' &&
      session.status !== 'pendiente_aprobacion'
    ) {
      return res.status(409).json({
        error:
          'La reunión Zoom gestionada solo se puede activar o desactivar mientras la sesión está en borrador o pendiente de aprobación.',
        code: 'ZOOM_MANAGED_LOCKED',
      });
    }

    // Turning managed ON is a TRANSITION: the stored intent is not yet true and the
    // request sets it. Re-sending `true` on an already-managed row is not a transition
    // and forces nothing — the guards above already govern that row.
    const managedIntentTransition =
      managedIntentAttempted &&
      req.body.is_zoom_managed === true &&
      session.is_zoom_managed !== true;

    // Mirror the POST eligibility rule (pages/api/sessions/index.ts:120-126): only an
    // online or híbrida session may be managed. Gated on the modality the row will HAVE,
    // so a PUT that flips to 'online' alongside the toggle is allowed. Checked before the
    // forcing below so a refused request writes nothing.
    if (managedIntentTransition) {
      const effectiveModality =
        req.body.modality !== undefined ? req.body.modality : session.modality;

      if (effectiveModality !== 'online' && effectiveModality !== 'hibrida') {
        return sendAuthError(
          res,
          'Solo las sesiones online o híbridas pueden usar una reunión Zoom gestionada por la plataforma',
          400
        );
      }
    }

    // Build update object (only allow specific fields)
    const updateData: any = {};
    const allowedFields = [
      'title',
      'description',
      'objectives',
      'meeting_link',
      'meeting_provider',
      'location',
      'meeting_summary',
      'meeting_transcript',
      'session_date',
      'start_time',
      'end_time',
      'modality',
      'growth_community_id',
      'school_id',
      'status',
      'is_zoom_managed',
    ];

    const fieldsChanged: string[] = [];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
        fieldsChanged.push(field);
      }
    });

    // §8: the ON transition forces the managed shape in the SAME update. Discarding the
    // manual link is the intended semantic of "the platform now owns this meeting", not
    // data loss — a managed row never carries a raw link, and the provisioner mints the
    // real one at approve time. POST already does exactly this at creation
    // (pages/api/sessions/index.ts:141-145 forces the provider, :219-221 the null link);
    // one rule now governs both entry points. Forced unconditionally rather than only
    // when the stored value differs: a difference-only rule would be a third rule POST
    // does not have, and it would leave a rival link in place if a concurrent PUT set one
    // between the SELECT above and this UPDATE.
    if (managedIntentTransition) {
      updateData.meeting_link = null;
      updateData.meeting_provider = 'zoom';

      if (!fieldsChanged.includes('meeting_link')) fieldsChanged.push('meeting_link');
      if (!fieldsChanged.includes('meeting_provider')) fieldsChanged.push('meeting_provider');
    }

    if (Object.keys(updateData).length === 0) {
      return sendAuthError(res, 'No hay campos para actualizar', 400);
    }

    // Optimistic locking: if client sent if_updated_at, include it as a guard
    const ifUpdatedAt =
      typeof req.body?.if_updated_at === 'string' ? req.body.if_updated_at : null;

    let updateQuery = serviceClient
      .from('consultor_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (ifUpdatedAt) {
      updateQuery = updateQuery.eq('updated_at', ifUpdatedAt);
    }

    const { data: updatedSession, error: updateError } = ifUpdatedAt
      ? await updateQuery.select('*').maybeSingle()
      : await updateQuery.select('*').single();

    if (updateError) {
      console.error('Database error updating session:', updateError);
      return sendAuthError(res, 'Error al actualizar sesión', 500, updateError.message);
    }

    // Guard matched zero rows — someone else modified the session in between
    if (ifUpdatedAt && !updatedSession) {
      const { data: currentSession } = await serviceClient
        .from('consultor_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      return res.status(409).json({
        error:
          'La sesión fue modificada por otro usuario. Recarga para ver los últimos cambios.',
        code: 'SESSION_CONFLICT',
        current: currentSession,
      });
    }

    // ---------------------------------------------------------------------
    // Z2-3b (plan §8): tell Zoom. Placed HERE — after the update has committed and
    // before the hours sync — for two reasons. The update is what makes the change
    // real, so nothing is enqueued for a change that did not land; and the hours sync
    // below can return 500, on a path where the session times DID move, so an enqueue
    // after it would leave Zoom holding the old time on exactly the case an admin is
    // being told to go and check.
    //
    // Neither call can throw and neither can change the response: both gate on the §14
    // flags and swallow their own errors, so every branch below returns byte-identical
    // status and body whether the job was enqueued, deduped, gated off, or errored.
    // ---------------------------------------------------------------------
    const flippedToPresencial =
      fieldsChanged.includes('modality') &&
      updatedSession?.modality === 'presencial' &&
      session.modality !== 'presencial';

    if (flippedToPresencial) {
      // A presencial session has nothing to join, so the meeting goes rather than moves
      // — even if this same request also changed the times.
      await enqueueSessionMeetingDelete({ session: updatedSession });
    } else if (updatedSession && isDurationRelevantChange(fieldsChanged)) {
      await enqueueSessionMeetingSync({ session: updatedSession });
    }

    // Z2-3a (plan §11): a PRE-EXECUTION reschedule must carry the hour reservation
    // with it. Until now this path never touched the ledger, so moving a session
    // 09:00–10:30 → 09:00–11:30 still billed 1.5 h.
    //
    // Gated on the status the row HAS AFTER the update, because that is the status
    // the RPC will read. Post-execution time edits stay allowed at the session level
    // and simply do not reach the RPC — the RPC refuses them on its own for any
    // other caller (it is the security boundary; this gate is only about not
    // provoking a refusal on a path that is legitimately allowed to edit times).
    if (
      updatedSession?.status === 'programada' &&
      isDurationRelevantChange(fieldsChanged)
    ) {
      const hoursSync = await syncRescheduleHours(serviceClient, sessionId, user.id);

      if (!hoursSync.ok) {
        // Loud, never silent: the session times moved but the ledger did not, and a
        // stale ledger is the exact billing bug this chunk exists to close.
        console.error('Error syncing reschedule hours:', hoursSync.error);
        return sendAuthError(
          res,
          'La sesión se actualizó, pero no se pudieron recalcular las horas del contrato. Revise el libro de horas antes de continuar.',
          500,
          hoursSync.error
        );
      }
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'edited',
      details: {
        changes: fieldsChanged.map(field => ({
          field,
          old: (session as any)[field],
          new: updateData[field],
        })),
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
    console.error('Update session error:', error);
    return sendAuthError(res, 'Error inesperado al actualizar sesión', 500, error.message);
  }
}
