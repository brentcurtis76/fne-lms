import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  sendApiError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { loadMeetingAuthContext } from '../../../../../lib/api/meetings/load-context';

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

  try {
    const ctx = await loadMeetingAuthContext<{ id: string; status: string }>(req, res, {
      meetingSelect:
        'id, status, created_by, facilitator_id, secretary_id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)',
      require: 'edit',
      requireDraft: true,
    });
    if (!ctx) return;

    const { meeting, serviceClient, user } = ctx;

    const bodyParse = startBodySchema.safeParse(req.body ?? {});
    if (!bodyParse.success) {
      const firstIssue = bodyParse.error.issues[0];
      return sendApiError(res, firstIssue?.message || 'Cuerpo inválido', 400);
    }
    const clientId = bodyParse.data.client_id ?? null;

    const { data: session, error: insertError } = await serviceClient
      .from('meeting_work_sessions')
      .insert({
        meeting_id: meeting.id,
        user_id: user.id,
        client_id: clientId,
      })
      .select('id')
      .single();

    if (insertError || !session) {
      console.error('Error creating work session:', insertError);
      return sendApiError(res, 'Error al iniciar sesión de trabajo', 500, insertError?.message);
    }

    return sendApiResponse(res, { id: session.id }, 201);
  } catch (error: any) {
    console.error('Work session start error:', error);
    return sendApiError(res, 'Error inesperado al iniciar sesión de trabajo', 500, error.message);
  }
}
