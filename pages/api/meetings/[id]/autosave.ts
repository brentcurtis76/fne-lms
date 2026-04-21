import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
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
import { canEditMeeting } from '../../../../lib/utils/meeting-policy';
import { plainTextFromDoc } from '../../../../lib/tiptap/helpers';

const autosaveSchema = z.object({
  summary_doc: z.record(z.unknown()),
  notes_doc: z.record(z.unknown()),
  version: z.number().int().nonnegative({ message: 'version debe ser un entero >= 0' }),
  work_session_id: z.string().uuid({ message: 'work_session_id inválido' }).optional(),
});

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

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de reunión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const parseResult = autosaveSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return sendAuthError(res, firstIssue?.message || 'Payload de autoguardado inválido', 400);
  }
  const { summary_doc, notes_doc, version, work_session_id } = parseResult.data;

  try {
    const serviceClient = createServiceRoleClient();

    const { data: meeting, error: meetingError } = await serviceClient
      .from('community_meetings')
      .select(
        'id, status, created_by, facilitator_id, secretary_id, version, updated_at, updated_by, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)'
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

    if (meeting.version !== version) {
      let updatedByName: string | null = null;
      if (meeting.updated_by) {
        const { data: updater } = await serviceClient
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', meeting.updated_by)
          .maybeSingle();
        if (updater) {
          updatedByName =
            `${updater.first_name ?? ''} ${updater.last_name ?? ''}`.trim() || null;
        }
      }
      return res.status(409).json({
        error: 'Conflicto de versión: la reunión fue modificada por otro usuario',
        current_version: meeting.version,
        updated_by_name: updatedByName,
        updated_at: meeting.updated_at,
      });
    }

    const now = new Date().toISOString();
    const summaryText = plainTextFromDoc(summary_doc);
    const notesText = plainTextFromDoc(notes_doc);
    const nextVersion = meeting.version + 1;

    // Optimistic-concurrency update: if someone else bumped `version` between
    // the fetch above and this write, the WHERE clause fails and we emit 409.
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
      .select('id, version, updated_at, updated_by')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating meeting on autosave:', updateError);
      return sendAuthError(res, 'Error al guardar la reunión', 500, updateError.message);
    }

    if (!updated) {
      const { data: fresh } = await serviceClient
        .from('community_meetings')
        .select('version, updated_at, updated_by')
        .eq('id', id)
        .single();

      let updatedByName: string | null = null;
      if (fresh?.updated_by) {
        const { data: updater } = await serviceClient
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', fresh.updated_by)
          .maybeSingle();
        if (updater) {
          updatedByName =
            `${updater.first_name ?? ''} ${updater.last_name ?? ''}`.trim() || null;
        }
      }

      return res.status(409).json({
        error: 'Conflicto de versión: la reunión fue modificada por otro usuario',
        current_version: fresh?.version ?? meeting.version,
        updated_by_name: updatedByName,
        updated_at: fresh?.updated_at ?? meeting.updated_at,
      });
    }

    // Heartbeat: bump last_heartbeat_at on the caller's active session so the
    // presence banner stays fresh. We only touch the row when it belongs to
    // this user and hasn't been ended — missing/ended rows are logged but
    // still return 200 (the autosave itself succeeded). We do NOT create new
    // session rows here; /work-session/start owns lifecycle.
    if (work_session_id) {
      const { data: hbRow, error: hbError } = await serviceClient
        .from('meeting_work_sessions')
        .update({ last_heartbeat_at: now })
        .eq('id', work_session_id)
        .eq('user_id', user.id)
        .is('ended_at', null)
        .select('id')
        .maybeSingle();

      if (hbError) {
        console.error('Error heartbeating work session on autosave:', hbError);
      } else if (!hbRow) {
        console.warn(
          `Heartbeat skipped: work session ${work_session_id} missing or already ended for user ${user.id}`
        );
      }
    }

    return sendApiResponse(res, {
      version: updated.version,
      work_session_id: work_session_id ?? null,
      updated_at: updated.updated_at,
    });
  } catch (error: any) {
    console.error('Autosave error:', error);
    return sendAuthError(res, 'Error inesperado al autoguardar', 500, error.message);
  }
}
