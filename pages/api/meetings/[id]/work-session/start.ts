import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  sendMeetingError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../utils/roleUtils';
import { canEditMeeting } from '../../../../../lib/utils/meeting-policy';

// Bounded validation so the `client_id` column isn't written with unbounded
// input. Keeps parity with the zod bodies on autosave + finalize.
const startBodySchema = z.object({
  client_id: z.string().min(1).max(128).optional(),
});

/**
 * POST /api/meetings/[id]/work-session/start
 * Opens a new collaborative work-session row for the current user on a meeting
 * draft and returns its id. The id is threaded back into subsequent
 * autosave calls so the server can track presence / heartbeat.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-work-session-start');

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

    if (meeting.status !== 'borrador') {
      return sendMeetingError(
        res,
        409,
        'meeting_not_draft',
        'La reunión ya no está en borrador',
      );
    }

    const bodyParse = startBodySchema.safeParse(req.body ?? {});
    if (!bodyParse.success) {
      const firstIssue = bodyParse.error.issues[0];
      return sendAuthError(res, firstIssue?.message || 'Cuerpo inválido', 400);
    }
    const clientId = bodyParse.data.client_id ?? null;

    const { data: session, error: insertError } = await serviceClient
      .from('meeting_work_sessions')
      .insert({
        meeting_id: id,
        user_id: user.id,
        client_id: clientId,
      })
      .select('id')
      .single();

    if (insertError || !session) {
      console.error('Error creating work session:', insertError);
      return sendAuthError(res, 'Error al iniciar sesión de trabajo', 500, insertError?.message);
    }

    return sendApiResponse(res, { id: session.id }, 201);
  } catch (error: any) {
    console.error('Work session start error:', error);
    return sendAuthError(res, 'Error inesperado al iniciar sesión de trabajo', 500, error.message);
  }
}
