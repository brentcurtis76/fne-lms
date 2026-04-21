/**
 * Meeting Access Policy Helpers
 *
 * Centralized policy functions for determining read and write access to
 * meetings and meeting commitments. All functions are pure — they accept
 * pre-fetched data and return boolean decisions.
 *
 * Mirrors the pattern established in `lib/utils/session-policy.ts` so
 * meeting APIs can enforce access consistently without policy drift.
 */

import type { UserRole } from '../../types/roles';
import type {
  CommunityMeeting,
  MeetingAttendee,
  MeetingCommitment,
} from '../../types/meetings';

/**
 * Minimal user shape passed to meeting policy helpers.
 * `highestRole` is the role type returned by `getUserPrimaryRole()`.
 */
export interface MeetingUser {
  id: string;
  highestRole: string;
  userRoles: UserRole[];
}

/**
 * Fields required from a meeting to make a policy decision.
 * Using a Pick keeps these helpers composable with both full
 * `CommunityMeeting` rows and partial DB selects.
 */
export type MeetingPolicyInput = Pick<
  CommunityMeeting,
  'created_by' | 'facilitator_id' | 'secretary_id' | 'status' | 'workspace'
>;

const EDITABLE_STATUSES = new Set(['borrador', 'programada', 'en_progreso']);

function isLiderComunidadForMeeting(
  user: MeetingUser,
  meeting: MeetingPolicyInput
): boolean {
  const communityId = meeting.workspace?.community?.id;
  if (!communityId) return false;

  return user.userRoles.some(
    (r) =>
      r.role_type === 'lider_comunidad' &&
      r.community_id === communityId &&
      r.is_active
  );
}

function isCoEditor(user: MeetingUser, attendees: MeetingAttendee[]): boolean {
  return attendees.some(
    (a) => a.user_id === user.id && a.role === 'co_editor'
  );
}

/**
 * Determine if a user can edit a meeting's documentation
 * (agreements, commitments, tasks, notes).
 *
 * Editable statuses: borrador, programada, en_progreso.
 * Once a meeting is completada or cancelada only admins can edit it.
 *
 * Editors (in a writable status):
 * - admin (full access, any status)
 * - creator (created_by)
 * - facilitator (facilitator_id)
 * - secretary (secretary_id)
 * - co_editor attendee
 * - lider_comunidad of the meeting's community
 */
export function canEditMeeting(
  user: MeetingUser,
  meeting: MeetingPolicyInput,
  attendees: MeetingAttendee[]
): boolean {
  // Admin is the only role that can edit completada/cancelada meetings
  if (user.highestRole === 'admin') return true;

  if (!EDITABLE_STATUSES.has(meeting.status)) return false;

  if (meeting.created_by === user.id) return true;
  if (meeting.facilitator_id === user.id) return true;
  if (meeting.secretary_id === user.id) return true;

  if (isCoEditor(user, attendees)) return true;
  if (isLiderComunidadForMeeting(user, meeting)) return true;

  return false;
}

/**
 * Determine if a user can finalize a meeting (move from borrador → completada).
 *
 * Finalization requires edit access AND the meeting must currently be in borrador.
 */
export function canFinalizeMeeting(
  user: MeetingUser,
  meeting: MeetingPolicyInput,
  attendees: MeetingAttendee[]
): boolean {
  return meeting.status === 'borrador' && canEditMeeting(user, meeting, attendees);
}

/**
 * Determine if a user can mark a commitment as resolved.
 *
 * Resolvers:
 * - the commitment's assignee (even after the meeting is completada)
 * - anyone who has meeting edit access
 */
export function canResolveCommitment(
  user: MeetingUser,
  commitment: Pick<MeetingCommitment, 'assigned_to'>,
  meeting: MeetingPolicyInput,
  attendees: MeetingAttendee[]
): boolean {
  if (commitment.assigned_to === user.id) return true;
  return canEditMeeting(user, meeting, attendees);
}
