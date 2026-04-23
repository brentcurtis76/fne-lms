import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendApiError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../../lib/api-auth';
import { Validators } from '../../../../../../lib/types/api-auth.types';

// Intentionally does NOT route through `loadMeetingAuthContext` or
// `canEditMeeting`. Reasoning:
//
// - `end` is idempotent cleanup, frequently called from `beforeunload` /
//   unmount after the caller has already transitioned the meeting to
//   `completada` via finalize. Routing through `canEditMeeting` would 403
//   the cleanup call for any non-admin (facilitator, secretary, co_editor)
//   because `completada` is not in `EDITABLE_STATUSES` — directly
//   contradicting the intent that finalize must survive unmount cleanup.
// - Ownership of the session row is the real authorization boundary here.
//   The UPDATE's `.eq('user_id', user.id)` guarantees a user can only close
//   their own session; status-based edit policy adds no value on top of
//   that because the user cannot cross rows regardless of meeting status.
// - No meeting-row fetch is required for the end path, so we skip the
//   select/join/policy plumbing entirely.

/**
 * POST /api/meetings/[id]/work-session/[sessionId]/end
 * Closes a collaborative work-session row by setting `ended_at = now()`.
 * Idempotent — only updates rows belonging to the authenticated caller
 * that are still open. Status-agnostic (see comment above).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-work-session-end');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id, sessionId } = req.query;
  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendApiError(res, 'ID de reunión inválido', 400);
  }
  if (!sessionId || typeof sessionId !== 'string' || !Validators.isUUID(sessionId)) {
    return sendApiError(res, 'ID de sesión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendApiError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
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
      return sendApiError(res, 'Error al cerrar sesión de trabajo', 500, updateError.message);
    }

    return sendApiResponse(res, { id: sessionId, ended_at: now });
  } catch (error: any) {
    console.error('Work session end error:', error);
    return sendApiError(res, 'Error inesperado al cerrar sesión de trabajo', 500, error.message);
  }
}
