/**
 * Meeting Access Policy Helpers
 *
 * Centralized policy functions for determining edit access to community
 * meetings, their finalization, and commitment resolution. Pure functions —
 * callers pre-fetch the user, meeting, and attendee rows and pass them in.
 *
 * Mirrors the approach in `session-policy.ts` so both surfaces stay aligned.
 */

import { UserRole } from '../../types/roles';
import {
  AttendeeRole,
  CommunityMeeting,
  MeetingAttendee,
  MeetingCommitment,
  MeetingStatus,
} from '../../types/meetings';

/**
 * Minimal user shape needed for meeting policy decisions.
 */
export interface MeetingPolicyUser {
  id: string;
  highestRole: string;
  userRoles: UserRole[];
}

/**
 * Minimal meeting shape needed for policy decisions. `community_id` is the
 * workspace's owning growth-community id (populated by caller via join).
 */
export type MeetingPolicyInput = Pick<
  CommunityMeeting,
  'id' | 'status' | 'created_by' | 'facilitator_id' | 'secretary_id'
> & {
  community_id?: string | null;
};

/**
 * Minimal attendee shape — just the fields the policy inspects.
 */
export type MeetingAttendeePolicyInput = Pick<MeetingAttendee, 'user_id' | 'role'>;

/** Statuses in which non-admin editors retain write access. */
const EDITABLE_STATUSES: ReadonlySet<MeetingStatus> = new Set<MeetingStatus>([
  'borrador',
  'en_progreso',
  'programada',
]);

/** Attendee roles that grant edit access (when status is editable). */
const EDITOR_ATTENDEE_ROLES: ReadonlySet<AttendeeRole> = new Set<AttendeeRole>([
  'facilitator',
  'secretary',
  'co_editor',
]);

/**
 * Determine whether `user` may edit `meeting`.
 *
 * Admins always pass. For everyone else the meeting status must be one of
 * `borrador`, `en_progreso`, `programada`, AND the user must be one of:
 *   - the creator
 *   - the designated facilitator or secretary (by id or attendee role)
 *   - an attendee with role `co_editor`
 *   - an active `lider_comunidad` of the meeting's community
 */
export function canEditMeeting(
  user: MeetingPolicyUser,
  meeting: MeetingPolicyInput,
  attendees: MeetingAttendeePolicyInput[] = []
): boolean {
  if (user.highestRole === 'admin') {
    return true;
  }

  if (!EDITABLE_STATUSES.has(meeting.status as MeetingStatus)) {
    return false;
  }

  if (meeting.created_by === user.id) return true;
  if (meeting.facilitator_id === user.id) return true;
  if (meeting.secretary_id === user.id) return true;

  const attendee = attendees.find((a) => a.user_id === user.id);
  if (attendee && EDITOR_ATTENDEE_ROLES.has(attendee.role)) {
    return true;
  }

  if (meeting.community_id) {
    const isGcLeader = user.userRoles.some(
      (r) =>
        r.role_type === 'lider_comunidad' &&
        r.community_id === meeting.community_id &&
        r.is_active
    );
    if (isGcLeader) return true;
  }

  return false;
}

/**
 * Finalizing a meeting means flipping `borrador` → `completada`. Only callers
 * that could already edit the draft are allowed to finalize it.
 */
export function canFinalizeMeeting(
  user: MeetingPolicyUser,
  meeting: MeetingPolicyInput,
  attendees: MeetingAttendeePolicyInput[] = []
): boolean {
  return meeting.status === 'borrador' && canEditMeeting(user, meeting, attendees);
}

/**
 * Resolving a commitment is allowed for the assignee or anyone who can edit
 * the parent meeting.
 */
export function canResolveCommitment(
  user: MeetingPolicyUser,
  commitment: Pick<MeetingCommitment, 'assigned_to'>,
  meeting: MeetingPolicyInput,
  attendees: MeetingAttendeePolicyInput[] = []
): boolean {
  if (commitment.assigned_to === user.id) return true;
  return canEditMeeting(user, meeting, attendees);
}
