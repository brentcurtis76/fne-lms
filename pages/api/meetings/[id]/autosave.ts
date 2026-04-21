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
import { canEditMeeting, type MeetingUser } from '../../../../lib/utils/meeting-policy';

// Recursively collect text nodes from a Tiptap/ProseMirror-style JSON document.
// The derived plaintext is used for search and list previews; exact formatting
// is intentionally not preserved.
function docToPlainText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  };
  walk(doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

interface AutosaveBody {
  summary_doc?: unknown;
  notes_doc?: unknown;
  version?: number;
  work_session_id?: string;
}

/**
 * POST /api/meetings/[id]/autosave
 * Debounced autosave for meeting rich-text documents.
 * Applies optimistic locking on `version`; returns 409 with current state
 * when the client's version is stale.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meeting-autosave');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de reunión inválido', 400);
  }

  const body = (req.body || {}) as AutosaveBody;
  const { summary_doc, notes_doc, version, work_session_id } = body;

  if (!Number.isInteger(version)) {
    return sendAuthError(res, 'version es requerido y debe ser un entero', 400);
  }
  if (work_session_id !== undefined && !Validators.isUUID(work_session_id)) {
    return sendAuthError(res, 'work_session_id inválido', 400);
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
        'id, created_by, facilitator_id, secretary_id, status, version, workspace:community_workspaces(id, community:growth_communities(id))'
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

    if ((meeting as any).version !== version) {
      return sendConflict(res, serviceClient, id);
    }

    const summaryText = docToPlainText(summary_doc);
    const notesText = docToPlainText(notes_doc);
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await serviceClient
      .from('community_meetings')
      .update({
        summary_doc: summary_doc ?? null,
        notes_doc: notes_doc ?? null,
        summary: summaryText || null,
        notes: notesText || null,
        version: version + 1,
        updated_by: user.id,
        updated_at: nowIso,
      })
      .eq('id', id)
      .eq('version', version)
      .select('version')
      .maybeSingle();

    if (updateError) {
      return sendAuthError(res, 'Error al guardar', 500, updateError.message);
    }

    if (!updated) {
      // Concurrent writer bumped the version between our read and write.
      return sendConflict(res, serviceClient, id);
    }

    let resolvedWorkSessionId = work_session_id;

    if (work_session_id) {
      const { error: endError } = await serviceClient
        .from('meeting_work_sessions')
        .update({ ended_at: nowIso })
        .eq('id', work_session_id)
        .eq('meeting_id', id)
        .eq('user_id', user.id);

      if (endError) {
        console.error('Error closing work session:', endError);
        // Non-fatal: the save succeeded.
      }
    } else {
      const { data: newSession, error: insertError } = await serviceClient
        .from('meeting_work_sessions')
        .insert({ meeting_id: id, user_id: user.id })
        .select('id')
        .single();

      if (insertError || !newSession) {
        console.error('Error creating work session:', insertError);
      } else {
        resolvedWorkSessionId = newSession.id;
      }
    }

    return sendApiResponse(res, {
      version: (updated as any).version as number,
      work_session_id: resolvedWorkSessionId ?? null,
    });
  } catch (error: any) {
    console.error('Meeting autosave error:', error);
    return sendAuthError(res, 'Error inesperado', 500, error?.message);
  }
}

async function sendConflict(
  res: NextApiResponse,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  meetingId: string
): Promise<void> {
  const { data: current } = await serviceClient
    .from('community_meetings')
    .select(
      'version, updated_at, updated_by_profile:profiles!community_meetings_updated_by_fkey(first_name, last_name)'
    )
    .eq('id', meetingId)
    .maybeSingle();

  const profile = (current as any)?.updated_by_profile;
  const updatedByName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || null
    : null;

  res.status(409).json({
    error: 'La reunión fue modificada por otro usuario',
    code: 'MEETING_VERSION_CONFLICT',
    currentVersion: (current as any)?.version ?? null,
    updated_by_name: updatedByName,
    updated_at: (current as any)?.updated_at ?? null,
  });
}
