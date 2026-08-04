import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
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
  SessionActivityLogInsert,
  AttendanceUpdatePayload,
} from '../../../../lib/types/consultor-sessions.types';
import { canViewSession, canContributeToSession, SessionAccessContext } from '../../../../lib/utils/session-policy';
import {
  canViewParticipantEmails,
  redactProfileEmails,
} from '../../../../lib/utils/session-disclosure';
import { sendSessionNotFound } from '../../../../lib/utils/session-denials';

const attendeeSchema = z.object({
  user_id: z.string().uuid({ message: 'user_id inválido en payload' }),
  attended: z.boolean({ invalid_type_error: 'attended debe ser booleano' }),
  arrival_status: z.enum(['on_time', 'late', 'left_early']).optional(),
  notes: z.string().max(500, { message: 'notes excede 500 caracteres' }).optional(),
});

const attendeesPayloadSchema = z.object({
  attendees: z.array(attendeeSchema, {
    required_error: 'Se requiere un array de asistentes',
    invalid_type_error: 'Se requiere un array de asistentes',
  }),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'sessions-attendees');

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
 * GET /api/sessions/[id]/attendees
 * List attendees with profile information
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session to verify access
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, growth_community_id, school_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendSessionNotFound(res);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Facilitator membership is not needed for the view check, but it decides
    // whether attendee e-mails are disclosed below.
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Use session-policy helper to check view access
    const accessContext: SessionAccessContext = {
      highestRole,
      userRoles,
      session: {
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        status: 'programada', // Status not needed for view check
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

    // Fetch attendees with profile info.
    //
    // The embed MUST name the FK: `session_attendees` has two into `profiles`
    // (`user_id` and `marked_by`), so a bare `profiles(...)` is ambiguous and
    // PostgREST answers PGRST201 before reading a row — which this handler turned
    // into a 500 for every caller. Aliased to `profiles` (not `profiles!…fkey`)
    // to match the detail GET at [id]/index.ts:125 and, more importantly, because
    // redactProfileEmails only strips e-mails under the key `profiles`
    // (session-disclosure.ts:175).
    const { data: attendees, error: attendeesError } = await serviceClient
      .from('session_attendees')
      .select('*, profiles:user_id(id, first_name, last_name, email)')
      .eq('session_id', sessionId)
      .order('created_at');

    if (attendeesError) {
      console.error('Error fetching attendees:', attendeesError);
      return sendAuthError(res, 'Error al obtener asistentes', 500, attendeesError.message);
    }

    // Attendee e-mails only for admins, school-scoped consultors and facilitators
    const visibleAttendees = canViewParticipantEmails(accessContext)
      ? attendees || []
      : redactProfileEmails(attendees || []);

    return sendApiResponse(res, { attendees: visibleAttendees });
  } catch (error: any) {
    console.error('Get attendees error:', error);
    return sendAuthError(res, 'Error inesperado al obtener asistentes', 500, error.message);
  }
}

/**
 * PUT /api/sessions/[id]/attendees
 * Bulk update attendance records
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, sessionId: string) {
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const parseResult = attendeesPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return sendAuthError(res, firstIssue?.message || 'Payload de asistentes inválido', 400);
  }

  const { attendees } = parseResult.data;

  try {
    const serviceClient = createServiceRoleClient();

    // Fetch session
    const { data: session, error: sessionError } = await serviceClient
      .from('consultor_sessions')
      .select('id, growth_community_id, school_id, status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Check if user is a facilitator for this session (needed for access context)
    const { data: facilitatorCheck } = await serviceClient
      .from('session_facilitators')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    const isFacilitator = !!facilitatorCheck;

    // Use session-policy helper to check contribute access (edit + status check)
    const accessContext: SessionAccessContext = {
      highestRole,
      userRoles,
      session: {
        school_id: session.school_id,
        growth_community_id: session.growth_community_id,
        status: session.status,
      },
      userId: user.id,
      isFacilitator,
    };

    if (!canContributeToSession(accessContext)) {
      if (session.status === 'completada' || session.status === 'cancelada') {
        return sendAuthError(res, 'No se puede editar asistencia de sesiones completadas o canceladas', 403);
      }
      return sendAuthError(res, 'Solo facilitadores o líderes de comunidad pueden editar asistencia', 403);
    }

    // Verify all user_ids exist as attendees for this session
    const { data: existingAttendees } = await serviceClient
      .from('session_attendees')
      .select('user_id')
      .eq('session_id', sessionId);

    const existingUserIds = new Set((existingAttendees || []).map((a) => a.user_id));
    const payloadUserIds = attendees.map((a) => a.user_id);

    for (const userId of payloadUserIds) {
      if (!existingUserIds.has(userId)) {
        return sendAuthError(res, `Usuario ${userId} no es asistente de esta sesión`, 400);
      }
    }

    // Update each attendee record (NOT upsert to avoid creating phantom rows)
    const updatePromises = attendees.map((att: AttendanceUpdatePayload) =>
      serviceClient
        .from('session_attendees')
        .update({
          attended: att.attended,
          arrival_status: att.arrival_status || null,
          notes: att.notes || null,
          marked_by: user.id,
          marked_at: new Date().toISOString(),
        })
        .eq('session_id', sessionId)
        .eq('user_id', att.user_id)
    );

    const results = await Promise.all(updatePromises);

    // Check for errors
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      console.error('Error updating attendance:', errors);
      return sendAuthError(res, 'Error al actualizar asistencia', 500);
    }

    // Insert activity log
    const activityLogEntry: SessionActivityLogInsert = {
      session_id: sessionId,
      user_id: user.id,
      action: 'attendance_recorded',
      details: { attendees_updated: attendees.length },
    };

    const { error: logError } = await serviceClient
      .from('session_activity_log')
      .insert(activityLogEntry);

    if (logError) {
      console.error('Error inserting activity log:', logError);
      // Don't fail the request
    }

    return sendApiResponse(res, { message: 'Asistencia actualizada', updated: attendees.length });
  } catch (error: any) {
    console.error('Update attendees error:', error);
    return sendAuthError(res, 'Error inesperado al actualizar asistencia', 500, error.message);
  }
}
