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
  SessionActivityLogInsert,
  AttendanceUpdatePayload,
} from '../../../../lib/types/consultor-sessions.types';

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
      return sendAuthError(res, 'Sesión no encontrada', 404);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Role-based access check
    let canAccess = false;

    if (highestRole === 'admin') {
      canAccess = true;
    } else if (highestRole === 'consultor') {
      // Check if consultant is at the same school
      const consultantSchools = userRoles
        .filter((r) => r.role_type === 'consultor' && r.school_id)
        .map((r) => r.school_id);

      if (consultantSchools.includes(session.school_id)) {
        canAccess = true;
      }
    } else {
      // GC members can also view attendees
      const gcMemberships = userRoles.filter(
        (r) => r.community_id === session.growth_community_id && r.is_active
      );
      if (gcMemberships.length > 0) {
        canAccess = true;
      }
    }

    if (!canAccess) {
      return sendAuthError(res, 'Acceso denegado a esta sesión', 403);
    }

    // Fetch attendees with profile info
    const { data: attendees, error: attendeesError } = await serviceClient
      .from('session_attendees')
      .select('*, profiles(id, first_name, last_name, email)')
      .eq('session_id', sessionId)
      .order('created_at');

    if (attendeesError) {
      console.error('Error fetching attendees:', attendeesError);
      return sendAuthError(res, 'Error al obtener asistentes', 500, attendeesError.message);
    }

    return sendApiResponse(res, { attendees: attendees || [] });
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

  const { attendees } = req.body;

  if (!attendees || !Array.isArray(attendees)) {
    return sendAuthError(res, 'Se requiere un array de asistentes', 400);
  }

  // Validate payload structure
  for (const att of attendees) {
    if (!att.user_id || typeof att.user_id !== 'string' || !Validators.isUUID(att.user_id)) {
      return sendAuthError(res, 'user_id inválido en payload', 400);
    }
    if (typeof att.attended !== 'boolean') {
      return sendAuthError(res, 'attended debe ser booleano', 400);
    }
    if (att.arrival_status && !['on_time', 'late', 'left_early'].includes(att.arrival_status)) {
      return sendAuthError(res, 'arrival_status inválido', 400);
    }
  }

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

    // Check if session is completada or cancelada (read-only)
    if (session.status === 'completada' || session.status === 'cancelada') {
      return sendAuthError(res, 'No se puede editar asistencia de sesiones completadas o canceladas', 403);
    }

    // Determine user role
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    // Auth check: facilitator OR GC leader
    let canEdit = false;

    if (highestRole === 'admin') {
      canEdit = true;
    } else {
      // Check if user is a facilitator
      const { data: facilitatorCheck } = await serviceClient
        .from('session_facilitators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (facilitatorCheck) {
        canEdit = true;
      } else {
        // Check if user is a GC leader for this session's community
        const isGcLeader = userRoles.some(
          (r) =>
            r.role_type === 'lider_comunidad' &&
            r.community_id === session.growth_community_id &&
            r.is_active
        );

        if (isGcLeader) {
          canEdit = true;
        }
      }
    }

    if (!canEdit) {
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
