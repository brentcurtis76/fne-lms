import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../../lib/api-auth';
import { Validators } from '../../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../../utils/roleUtils';
import { canEditMeeting } from '../../../../../../lib/utils/meeting-policy';

/**
 * POST /api/meetings/[id]/work-session/[sessionId]/end
 * Closes a collaborative work-session row by setting `ended_at = now()`.
 * Idempotent — only updates rows belonging to the caller that are still open.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-work-session-end');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id, sessionId } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de reunión inválido', 400);
  }

  if (!sessionId || typeof sessionId !== 'string' || !Validators.isUUID(sessionId)) {
    return sendAuthError(res, 'ID de sesión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: meeting, error: meetingError } = await serviceClient
      .from('community_meetings')
      .select(
        'id, status, created_by, facilitator_id, secretary_id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)'
      )
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return sendAuthError(res, 'Reunión no encontrada', 404);
    }

    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    const { data: attendees } = await serviceClient
      .from('meeting_attendees')
      .select('user_id, role')
      .eq('meeting_id', id);

    const workspace = Array.isArray((meeting as any).workspace)
      ? (meeting as any).workspace[0]
      : (meeting as any).workspace;

    if (
      !canEditMeeting(
        { id: user.id, highestRole, userRoles },
        {
          id: meeting.id,
          status: meeting.status,
          created_by: meeting.created_by,
          facilitator_id: meeting.facilitator_id,
          secretary_id: meeting.secretary_id,
          community_id: workspace?.community_id ?? null,
        },
        attendees || []
      )
    ) {
      return sendAuthError(res, 'No tiene permisos para editar esta reunión', 403);
    }

    const now = new Date().toISOString();

    const { error: updateError } = await serviceClient
      .from('meeting_work_sessions')
      .update({ ended_at: now })
      .eq('id', sessionId)
      .eq('meeting_id', id)
      .eq('user_id', user.id)
      .is('ended_at', null);

    if (updateError) {
      console.error('Error ending work session:', updateError);
      return sendAuthError(res, 'Error al cerrar sesión de trabajo', 500, updateError.message);
    }

    return sendApiResponse(res, { id: sessionId, ended_at: now });
  } catch (error: any) {
    console.error('Work session end error:', error);
    return sendAuthError(res, 'Error inesperado al cerrar sesión de trabajo', 500, error.message);
  }
}
