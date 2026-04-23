import { NextApiRequest, NextApiResponse } from 'next';
import {
  sendApiError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../../lib/api-auth';
import { Validators } from '../../../../../../lib/types/api-auth.types';
import { loadMeetingAuthContext } from '../../../../../../lib/api/meetings/load-context';

// NOTE: intentionally no `requireDraft` here — `end` is idempotent and must
// stay callable after finalize so the `beforeunload` cleanup path can close
// its local session without producing 409 toast noise. finalize.ts already
// closes open sessions server-side; if the row is already closed, the UPDATE
// below simply affects zero rows and we return 200.

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

  const { sessionId } = req.query;
  if (!sessionId || typeof sessionId !== 'string' || !Validators.isUUID(sessionId)) {
    return sendApiError(res, 'ID de sesión inválido', 400);
  }

  try {
    const ctx = await loadMeetingAuthContext<{ id: string }>(req, res, {
      meetingSelect:
        'id, status, created_by, facilitator_id, secretary_id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)',
      require: 'edit',
    });
    if (!ctx) return;

    const { meeting, serviceClient, user } = ctx;
    const now = new Date().toISOString();

    const { error: updateError } = await serviceClient
      .from('meeting_work_sessions')
      .update({ ended_at: now })
      .eq('id', sessionId)
      .eq('meeting_id', meeting.id)
      .eq('user_id', user.id)
      .is('ended_at', null);

    if (updateError) {
      console.error('Error ending work session:', updateError);
      return sendApiError(res, 'Error al cerrar sesión de trabajo', 500, updateError.message);
    }

    return sendApiResponse(res, { id: sessionId, ended_at: now });
  } catch (error: any) {
    console.error('Work session end error:', error);
    return sendApiError(res, 'Error inesperado al cerrar sesión de trabajo', 500, error.message);
  }
}
