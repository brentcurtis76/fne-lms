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
  MEETING_STATUS,
} from '../../utils/meeting-policy';
import type { UserRole } from '../../../types/roles';
import type { MeetingStatus } from '../../../types/meetings';

export type MeetingAuthRequire = 'edit' | 'finalize';

/**
 * Shared `workspace:community_workspaces!…(community_id)` join fragment.
 * Every meeting select in the app needs this to resolve community-scoped
 * policy/recipient logic; exporting it keeps the FK-hinted relation name
 * DRY so a future rename doesn't silently break half of the callers.
 */
export const MEETING_WORKSPACE_JOIN =
  'workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)';

/**
 * The minimum column set `loadMeetingAuthContext` needs to execute the
 * `canEditMeeting` / `canFinalizeMeeting` policy helpers. Exported so the
 * four calling routes compose their select as `${MEETING_POLICY_COLUMNS}, …`
 * instead of re-spelling the prefix (and risking drift — e.g. a typo in
 * `facilitator_id` would be a silent authz bug).
 */
export const MEETING_POLICY_COLUMNS = `id, status, created_by, facilitator_id, secretary_id, ${MEETING_WORKSPACE_JOIN}`;

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
 * Internal minimum shape the helper reads off the loaded `meeting` row. The
 * public generic `M` preserves the caller's concrete type for the returned
 * `ctx.meeting`, but the six reads this helper performs are typed through
 * `MeetingPolicyFields` so a single cast suffices — previously every read
 * was its own `(meeting as any)` cast, which hid the fact that a typo in a
 * caller's `meetingSelect` string would only surface at runtime.
 */
interface MeetingPolicyFields {
  id: string;
  status: MeetingStatus;
  created_by: string;
  facilitator_id: string | null;
  secretary_id: string | null;
  workspace: unknown;
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

  // Single cast to the internal contract so the six reads below are typed.
  const m = meeting as unknown as MeetingPolicyFields;

  // Supabase returns joined rows as either an object OR a single-element
  // array depending on the relationship definition. Normalize to object.
  const rawWorkspace = m.workspace;
  const workspace = (Array.isArray(rawWorkspace)
    ? rawWorkspace[0] ?? null
    : rawWorkspace ?? null) as { community_id: string | null } | null;

  // Draft-gate BEFORE the edit-policy check. `canEditMeeting` denies
  // non-admin callers when the status is outside EDITABLE_STATUSES, so a
  // concurrently-finalized meeting would otherwise surface as 403 for
  // facilitators/secretaries — never reaching the 409 `meeting_not_draft`
  // branch the client relies on to auto-reload. Admins would still see 409
  // (they pass the policy check), so the client handler worked only for
  // admins. This ordering gives every caller the 409 signal.
  if (opts.requireDraft && m.status !== MEETING_STATUS.BORRADOR) {
    sendMeetingError(
      res,
      409,
      'meeting_not_draft',
      'La reunión ya no está en borrador',
    );
    return null;
  }

  const policyInput = {
    id: m.id,
    status: m.status,
    created_by: m.created_by,
    facilitator_id: m.facilitator_id,
    secretary_id: m.secretary_id,
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
