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
import { canFinalizeMeeting } from '../../../../lib/utils/meeting-policy';
import { getCommunityRecipients } from '../../../../lib/notificationService';

/**
 * GET /api/meetings/[id]/recipients?audience=community|attended
 * Lightweight recipient-count preview for the finalize dialog. Returns only
 * the count — not the list — to avoid leaking emails through a UI-preview
 * endpoint.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-recipients');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { id, audience } = req.query;
  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de reunión inválido', 400);
  }
  if (audience !== 'community' && audience !== 'attended') {
    return sendAuthError(res, 'audience inválida', 400);
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
      !canFinalizeMeeting(
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
      return sendAuthError(res, 'No tiene permisos para previsualizar esta reunión', 403);
    }

    const recipients = await getCommunityRecipients(serviceClient, id, {
      onlyAttended: audience === 'attended',
    });

    return sendApiResponse(res, { count: recipients.length });
  } catch (error: any) {
    console.error('Recipients preview error:', error);
    return sendAuthError(res, 'Error inesperado al previsualizar destinatarios', 500, error.message);
  }
}
