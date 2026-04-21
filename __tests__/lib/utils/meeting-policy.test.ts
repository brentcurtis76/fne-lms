// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  canEditMeeting,
  canFinalizeMeeting,
  canResolveCommitment,
  type MeetingUser,
  type MeetingPolicyInput,
} from '../../../lib/utils/meeting-policy';
import type { MeetingAttendee, MeetingCommitment, MeetingStatus } from '../../../types/meetings';
import type { UserRole } from '../../../types/roles';

const USER_ID = 'user-uuid-1111';
const OTHER_USER_ID = 'user-uuid-2222';
const COMMUNITY_ID = 'gc-uuid-1111';
const OTHER_COMMUNITY_ID = 'gc-uuid-9999';

function buildUser(overrides?: Partial<MeetingUser>): MeetingUser {
  return {
    id: USER_ID,
    highestRole: 'docente',
    userRoles: [],
    ...overrides,
  };
}

function buildUserRole(overrides?: Partial<Record<string, unknown>>): UserRole {
  return {
    id: 'role-uuid-1111',
    user_id: USER_ID,
    role_type: 'lider_comunidad',
    community_id: COMMUNITY_ID,
    is_active: true,
    created_at: new Date().toISOString(),
    assigned_at: new Date().toISOString(),
    ...overrides,
  } as unknown as UserRole;
}

function buildMeeting(overrides?: Partial<MeetingPolicyInput> & { status?: MeetingStatus }): MeetingPolicyInput {
  return {
    created_by: OTHER_USER_ID,
    facilitator_id: undefined,
    secretary_id: undefined,
    status: 'borrador',
    workspace: {
      id: 'ws-1',
      name: 'Workspace 1',
      community: { id: COMMUNITY_ID, name: 'Community 1' },
    },
    ...overrides,
  };
}

function buildAttendee(overrides?: Partial<MeetingAttendee>): MeetingAttendee {
  return {
    id: 'att-1',
    meeting_id: 'mtg-1',
    user_id: USER_ID,
    attendance_status: 'confirmed',
    role: 'participant',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildCommitment(overrides?: Partial<MeetingCommitment>): MeetingCommitment {
  return {
    id: 'com-1',
    meeting_id: 'mtg-1',
    commitment_text: 'Do the thing',
    assigned_to: OTHER_USER_ID,
    status: 'pendiente',
    progress_percentage: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('meeting-policy helpers', () => {
  describe('canEditMeeting', () => {
    it('allows admin to edit a borrador meeting', () => {
      const user = buildUser({ highestRole: 'admin' });
      expect(canEditMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
    });

    it('allows admin to edit a completada meeting', () => {
      const user = buildUser({ highestRole: 'admin' });
      expect(canEditMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(true);
    });

    it('allows admin to edit a cancelada meeting', () => {
      const user = buildUser({ highestRole: 'admin' });
      expect(canEditMeeting(user, buildMeeting({ status: 'cancelada' }), [])).toBe(true);
    });

    it('allows creator to edit a borrador meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID, status: 'borrador' });
      expect(canEditMeeting(user, meeting, [])).toBe(true);
    });

    it('allows creator to edit a programada meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID, status: 'programada' });
      expect(canEditMeeting(user, meeting, [])).toBe(true);
    });

    it('allows creator to edit an en_progreso meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID, status: 'en_progreso' });
      expect(canEditMeeting(user, meeting, [])).toBe(true);
    });

    it('denies creator editing a completada meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID, status: 'completada' });
      expect(canEditMeeting(user, meeting, [])).toBe(false);
    });

    it('denies creator editing a cancelada meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID, status: 'cancelada' });
      expect(canEditMeeting(user, meeting, [])).toBe(false);
    });

    it('allows facilitator to edit', () => {
      const user = buildUser();
      const meeting = buildMeeting({ facilitator_id: USER_ID });
      expect(canEditMeeting(user, meeting, [])).toBe(true);
    });

    it('allows secretary to edit', () => {
      const user = buildUser();
      const meeting = buildMeeting({ secretary_id: USER_ID });
      expect(canEditMeeting(user, meeting, [])).toBe(true);
    });

    it('allows co_editor attendee to edit', () => {
      const user = buildUser();
      const meeting = buildMeeting();
      const attendees = [buildAttendee({ role: 'co_editor' })];
      expect(canEditMeeting(user, meeting, attendees)).toBe(true);
    });

    it('denies participant attendee from editing', () => {
      const user = buildUser();
      const meeting = buildMeeting();
      const attendees = [buildAttendee({ role: 'participant' })];
      expect(canEditMeeting(user, meeting, attendees)).toBe(false);
    });

    it('denies observer attendee from editing', () => {
      const user = buildUser();
      const meeting = buildMeeting();
      const attendees = [buildAttendee({ role: 'observer' })];
      expect(canEditMeeting(user, meeting, attendees)).toBe(false);
    });

    it('allows lider_comunidad of the meeting community to edit', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildUserRole({ community_id: COMMUNITY_ID })],
      });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(true);
    });

    it('denies lider_comunidad of a different community', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildUserRole({ community_id: OTHER_COMMUNITY_ID })],
      });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(false);
    });

    it('ignores inactive lider_comunidad role', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildUserRole({ community_id: COMMUNITY_ID, is_active: false })],
      });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(false);
    });

    it('denies lider_comunidad editing completada meeting', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildUserRole({ community_id: COMMUNITY_ID })],
      });
      expect(canEditMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(false);
    });

    it('denies co_editor editing cancelada meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ status: 'cancelada' });
      const attendees = [buildAttendee({ role: 'co_editor' })];
      expect(canEditMeeting(user, meeting, attendees)).toBe(false);
    });

    it('denies unrelated docente with no roles', () => {
      const user = buildUser();
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(false);
    });

    it('denies editing pospuesta meeting for non-admin', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID, status: 'pospuesta' });
      expect(canEditMeeting(user, meeting, [])).toBe(false);
    });

    it('handles meeting without workspace.community populated', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildUserRole({ community_id: COMMUNITY_ID })],
      });
      const meeting = buildMeeting({ workspace: undefined });
      expect(canEditMeeting(user, meeting, [])).toBe(false);
    });
  });

  describe('canFinalizeMeeting', () => {
    it('allows admin on borrador', () => {
      const user = buildUser({ highestRole: 'admin' });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
    });

    it('denies admin on already-completada meeting', () => {
      const user = buildUser({ highestRole: 'admin' });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(false);
    });

    it('denies admin on programada meeting', () => {
      const user = buildUser({ highestRole: 'admin' });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(false);
    });

    it('allows facilitator on borrador meeting', () => {
      const user = buildUser();
      const meeting = buildMeeting({ facilitator_id: USER_ID, status: 'borrador' });
      expect(canFinalizeMeeting(user, meeting, [])).toBe(true);
    });

    it('denies facilitator when meeting not in borrador', () => {
      const user = buildUser();
      const meeting = buildMeeting({ facilitator_id: USER_ID, status: 'en_progreso' });
      expect(canFinalizeMeeting(user, meeting, [])).toBe(false);
    });

    it('denies unrelated user on borrador', () => {
      const user = buildUser();
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(false);
    });

    it('allows co_editor on borrador', () => {
      const user = buildUser();
      const attendees = [buildAttendee({ role: 'co_editor' })];
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), attendees)).toBe(true);
    });
  });

  describe('canResolveCommitment', () => {
    it('allows assignee to resolve their own commitment', () => {
      const user = buildUser();
      const commitment = buildCommitment({ assigned_to: USER_ID });
      expect(canResolveCommitment(user, commitment, buildMeeting(), [])).toBe(true);
    });

    it('allows assignee to resolve even when meeting is completada', () => {
      const user = buildUser();
      const commitment = buildCommitment({ assigned_to: USER_ID });
      const meeting = buildMeeting({ status: 'completada' });
      expect(canResolveCommitment(user, commitment, meeting, [])).toBe(true);
    });

    it('allows admin to resolve any commitment', () => {
      const user = buildUser({ highestRole: 'admin' });
      const commitment = buildCommitment({ assigned_to: OTHER_USER_ID });
      expect(canResolveCommitment(user, commitment, buildMeeting(), [])).toBe(true);
    });

    it('allows admin to resolve a commitment on a completada meeting', () => {
      const user = buildUser({ highestRole: 'admin' });
      const commitment = buildCommitment({ assigned_to: OTHER_USER_ID });
      const meeting = buildMeeting({ status: 'completada' });
      expect(canResolveCommitment(user, commitment, meeting, [])).toBe(true);
    });

    it('allows meeting creator to resolve other users commitment', () => {
      const user = buildUser();
      const meeting = buildMeeting({ created_by: USER_ID });
      const commitment = buildCommitment({ assigned_to: OTHER_USER_ID });
      expect(canResolveCommitment(user, commitment, meeting, [])).toBe(true);
    });

    it('denies unrelated user from resolving someone elses commitment', () => {
      const user = buildUser();
      const commitment = buildCommitment({ assigned_to: OTHER_USER_ID });
      expect(canResolveCommitment(user, commitment, buildMeeting(), [])).toBe(false);
    });

    it('denies non-assignee non-editor on completada meeting', () => {
      const user = buildUser();
      const commitment = buildCommitment({ assigned_to: OTHER_USER_ID });
      const meeting = buildMeeting({ status: 'completada' });
      expect(canResolveCommitment(user, commitment, meeting, [])).toBe(false);
    });

    it('allows co_editor to resolve commitment on borrador meeting', () => {
      const user = buildUser();
      const commitment = buildCommitment({ assigned_to: OTHER_USER_ID });
      const attendees = [buildAttendee({ role: 'co_editor' })];
      expect(canResolveCommitment(user, commitment, buildMeeting(), attendees)).toBe(true);
    });
  });
});
