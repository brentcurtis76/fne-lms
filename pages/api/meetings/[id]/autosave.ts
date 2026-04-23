import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  createServiceRoleClient,
  sendApiError,
  sendApiResponse,
  sendMeetingError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { plainTextFromDoc } from '../../../../lib/tiptap/helpers';
import { loadMeetingAuthContext } from '../../../../lib/api/meetings/load-context';

const autosaveSchema = z.object({
  summary_doc: z.record(z.unknown()),
  notes_doc: z.record(z.unknown()),
  version: z.number().int().nonnegative({ message: 'version debe ser un entero >= 0' }),
  work_session_id: z.string().uuid({ message: 'work_session_id inválido' }).optional(),
});

// Resolve a profile id into a "First Last" display name, or null when the row
// is missing / both name fields are blank. Used in the two version-conflict
// branches so the client can show "Modificado por Ana Pérez" in the reload
// dialog.
async function resolveUpdaterName(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  updaterId: string | null,
): Promise<string | null> {
  if (!updaterId) return null;
  const { data } = await serviceClient
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', updaterId)
    .maybeSingle();
  if (!data) return null;
  return `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || null;
}

/**
 * POST /api/meetings/[id]/autosave
 * Optimistic-concurrency autosave for meeting drafts. Rejects with 409 when
 * the caller's version is stale; otherwise bumps the version and writes the
 * new prosemirror docs plus their derived plain-text mirror. The call also
 * touches (or creates) the work-session row so presence stays fresh.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-autosave');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const parseResult = autosaveSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return sendApiError(res, firstIssue?.message || 'Payload de autoguardado inválido', 400);
  }
  const { summary_doc, notes_doc, version, work_session_id } = parseResult.data;

  try {
    const ctx = await loadMeetingAuthContext<{
      id: string;
      status: string;
      version: number;
      updated_at: string;
      updated_by: string | null;
    }>(req, res, {
      meetingSelect:
        'id, status, created_by, facilitator_id, secretary_id, version, updated_at, updated_by, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)',
      require: 'edit',
      requireDraft: true,
    });
    if (!ctx) return;

    const { meeting, serviceClient, user } = ctx;
    const id = meeting.id;

    if (meeting.version !== version) {
      const updatedByName = await resolveUpdaterName(serviceClient, meeting.updated_by);
      return res.status(409).json({
        error: 'Conflicto de versión: la reunión fue modificada por otro usuario',
        code: 'version_conflict',
        current_version: meeting.version,
        updated_by_name: updatedByName,
        updated_at: meeting.updated_at,
      });
    }

    const now = new Date().toISOString();
    const summaryText = plainTextFromDoc(summary_doc);
    const notesText = plainTextFromDoc(notes_doc);
    const nextVersion = meeting.version + 1;

    // Optimistic-concurrency update guarded by `version` AND `status='borrador'`.
    // The status guard closes the autosave/finalize race: if finalize won
    // between the read above and this write, status is no longer 'borrador'
    // and the update affects zero rows instead of silently writing over a
    // finalized meeting.
    const { data: updated, error: updateError } = await serviceClient
      .from('community_meetings')
      .update({
        summary_doc,
        notes_doc,
        summary: summaryText,
        notes: notesText,
        version: nextVersion,
        updated_by: user.id,
        updated_at: now,
      })
      .eq('id', id)
      .eq('version', version)
      .eq('status', 'borrador')
      .select('id, version, updated_at, updated_by')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating meeting on autosave:', updateError);
      return sendApiError(res, 'Error al guardar la reunión', 500, updateError.message);
    }

    if (!updated) {
      const { data: fresh } = await serviceClient
        .from('community_meetings')
        .select('version, status, updated_at, updated_by')
        .eq('id', id)
        .single();

      // We loaded the meeting as borrador but the guarded update wrote zero
      // rows and the row is no longer a draft — finalize won the race.
      if (fresh?.status && fresh.status !== 'borrador') {
        return sendMeetingError(
          res,
          409,
          'meeting_finalized_concurrently',
          'La reunión fue finalizada mientras editabas',
        );
      }

      const updatedByName = await resolveUpdaterName(serviceClient, fresh?.updated_by ?? null);
      return res.status(409).json({
        error: 'Conflicto de versión: la reunión fue modificada por otro usuario',
        code: 'version_conflict',
        current_version: fresh?.version ?? meeting.version,
        updated_by_name: updatedByName,
        updated_at: fresh?.updated_at ?? meeting.updated_at,
      });
    }

    // Touch the active work-session heartbeat so presence stays fresh.
    // We do NOT create a new row here — that is the job of
    // /api/meetings/[id]/work-session/start. If the session is missing or
    // already ended, the UPDATE simply affects zero rows and we still return 200.
    if (work_session_id) {
      const { error: hbError } = await serviceClient
        .from('meeting_work_sessions')
        .update({ last_heartbeat_at: now })
        .eq('id', work_session_id)
        .eq('user_id', user.id)
        .is('ended_at', null);

      if (hbError) {
        console.error('Error updating work session heartbeat on autosave:', hbError);
      }
    }

    return sendApiResponse(res, {
      version: updated.version,
      work_session_id: work_session_id ?? null,
      updated_at: updated.updated_at,
    });
  } catch (error: any) {
    console.error('Autosave error:', error);
    return sendApiError(res, 'Error inesperado al autoguardar', 500, error.message);
  }
}
