/**
 * Shared meeting auth + context loader.
 *
 * The five meeting API routes (autosave, finalize, recipients,
 * work-session/start, work-session/[sessionId]/end) all shared a ~40-line
 * block of meeting → roles → attendees → workspace-normalize → policy plumbing.
 * Five copies is exactly where drift produces silent authz bugs — see
 * the refactor-review findings (H3). This helper centralizes that block.
 *
 * Contract: on success returns the loaded context. On any failure it has
 * ALREADY sent an error response and returns `null` — callers must bail out
 * immediately without writing further to `res`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendMeetingError,
} from '../../api-auth';
import { Validators } from '../../types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';
import {
  canEditMeeting,
  canFinalizeMeeting,
} from '../../utils/meeting-policy';
import type { UserRole } from '../../../types/roles';

export type MeetingAuthRequire = 'edit' | 'finalize';

export interface LoadMeetingAuthContextOptions {
  /** Columns to include on the `.select(...)` for `community_meetings`. */
  meetingSelect: string;
  /** Which policy helper to apply. */
  require: MeetingAuthRequire;
  /**
   * When true, also reject with 409 `meeting_not_draft` if the loaded row
   * is no longer in `borrador`. Most write routes want this; `finalize`
   * itself handles this guard separately because it has a different
   * `meeting_already_finalized` branch.
   */
  requireDraft?: boolean;
}

// Matches what getApiUser returns — Supabase's user object, with `id` as the
// contract everyone actually needs. Kept loose so route handlers can access
// any other User field when needed.
export interface MeetingAuthContext<M = Record<string, any>> {
  user: { id: string } & Record<string, any>;
  userRoles: UserRole[];
  highestRole: string;
  meeting: M;
  workspace: { community_id: string | null } | null;
  attendees: Array<{ user_id: string; role: string }>;
  serviceClient: ReturnType<typeof createServiceRoleClient>;
}

/**
 * Load + authorize a meeting for a route handler. On failure, responds on
 * `res` and returns `null` — the caller must `return` immediately when the
 * result is null.
 *
 * Kept as a free function (not a higher-order wrapper) so individual routes
 * remain easy to trace when reading top-down.
 */
export async function loadMeetingAuthContext<M extends Record<string, any> = Record<string, any>>(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: LoadMeetingAuthContextOptions,
): Promise<MeetingAuthContext<M> | null> {
  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    sendAuthError(res, 'ID de reunión inválido', 400);
    return null;
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    sendAuthError(res, 'Autenticación requerida', 401);
    return null;
  }

  const serviceClient = createServiceRoleClient();

  const { data: meeting, error: meetingError } = await serviceClient
    .from('community_meetings')
    .select(opts.meetingSelect)
    .eq('id', id)
    .single();

  if (meetingError || !meeting) {
    sendAuthError(res, 'Reunión no encontrada', 404);
    return null;
  }

  const userRoles = await getUserRoles(serviceClient, user.id);
  const highestRole = getHighestRole(userRoles);

  if (!highestRole) {
    sendAuthError(res, 'Usuario sin roles asignados', 403);
    return null;
  }

  const { data: attendeesRaw } = await serviceClient
    .from('meeting_attendees')
    .select('user_id, role')
    .eq('meeting_id', id);
  const attendees = attendeesRaw || [];

  // Supabase returns joined rows as either an object OR a single-element
  // array depending on the relationship definition. Normalize to object.
  const rawWorkspace = (meeting as any).workspace;
  const workspace = Array.isArray(rawWorkspace)
    ? rawWorkspace[0] ?? null
    : rawWorkspace ?? null;

  const policyInput = {
    id: (meeting as any).id,
    status: (meeting as any).status,
    created_by: (meeting as any).created_by,
    facilitator_id: (meeting as any).facilitator_id,
    secretary_id: (meeting as any).secretary_id,
    community_id: workspace?.community_id ?? null,
  };

  const policyUser = { id: user.id, highestRole, userRoles };

  const policyCheck =
    opts.require === 'finalize'
      ? canFinalizeMeeting(policyUser, policyInput, attendees)
      : canEditMeeting(policyUser, policyInput, attendees);

  if (!policyCheck) {
    const msg =
      opts.require === 'finalize'
        ? 'No tiene permisos para finalizar esta reunión'
        : 'No tiene permisos para editar esta reunión';
    sendAuthError(res, msg, 403);
    return null;
  }

  if (opts.requireDraft && (meeting as any).status !== 'borrador') {
    sendMeetingError(
      res,
      409,
      'meeting_not_draft',
      'La reunión ya no está en borrador',
    );
    return null;
  }

  return {
    user,
    userRoles,
    highestRole,
    meeting: meeting as unknown as M,
    workspace,
    attendees,
    serviceClient,
  };
}
