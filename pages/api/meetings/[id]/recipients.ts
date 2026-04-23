import { NextApiRequest, NextApiResponse } from 'next';
import {
  sendApiError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getCommunityRecipients } from '../../../../lib/notificationService';
import { loadMeetingAuthContext } from '../../../../lib/api/meetings/load-context';

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

  const { audience } = req.query;
  if (audience !== 'community' && audience !== 'attended') {
    return sendApiError(res, 'audience inválida', 400);
  }

  try {
    const ctx = await loadMeetingAuthContext<{ id: string }>(req, res, {
      meetingSelect:
        'id, status, created_by, facilitator_id, secretary_id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)',
      require: 'finalize',
    });
    if (!ctx) return;

    const { meeting, serviceClient } = ctx;

    const recipients = await getCommunityRecipients(serviceClient, meeting.id, {
      onlyAttended: audience === 'attended',
    });

    return sendApiResponse(res, { count: recipients.length });
  } catch (error: any) {
    console.error('Recipients preview error:', error);
    return sendApiError(res, 'Error inesperado al previsualizar destinatarios', 500, error.message);
  }
}
