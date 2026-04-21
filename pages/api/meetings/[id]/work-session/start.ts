import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../utils/roleUtils';
import { canEditMeeting, type MeetingUser } from '../../../../../lib/utils/meeting-policy';

/**
 * POST /api/meetings/[id]/work-session/start
 * Open a new collaborative work session row for the current user.
 * Returns { work_session_id }.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meeting-work-session-start');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de reunión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);
    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    const { data: meeting, error: meetingError } = await serviceClient
      .from('community_meetings')
      .select(
        'id, created_by, facilitator_id, secretary_id, status, workspace:community_workspaces(id, community:growth_communities(id))'
      )
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (meetingError || !meeting) {
      return sendAuthError(res, 'Reunión no encontrada', 404);
    }

    const { data: attendees, error: attendeesError } = await serviceClient
      .from('meeting_attendees')
      .select('id, meeting_id, user_id, role, attendance_status, created_at, updated_at')
      .eq('meeting_id', id);

    if (attendeesError) {
      return sendAuthError(res, 'Error al cargar asistentes', 500, attendeesError.message);
    }

    const policyUser: MeetingUser = {
      id: user.id,
      highestRole,
      userRoles,
    };

    if (!canEditMeeting(policyUser, meeting as any, attendees || [])) {
      return sendAuthError(res, 'No tiene permisos para editar esta reunión', 403);
    }

    const { data: session, error: insertError } = await serviceClient
      .from('meeting_work_sessions')
      .insert({ meeting_id: id, user_id: user.id })
      .select('id')
      .single();

    if (insertError || !session) {
      return sendAuthError(
        res,
        'Error al iniciar sesión de trabajo',
        500,
        insertError?.message
      );
    }

    return sendApiResponse(res, { work_session_id: session.id }, 201);
  } catch (error: any) {
    console.error('Meeting work-session start error:', error);
    return sendAuthError(res, 'Error inesperado', 500, error?.message);
  }
}
