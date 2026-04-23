// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  canEditMeeting,
  canFinalizeMeeting,
  canResolveCommitment,
  type MeetingAttendeePolicyInput,
  type MeetingPolicyInput,
  type MeetingPolicyUser,
} from '../../../lib/utils/meeting-policy';
import type { UserRole } from '../../../types/roles';
import type { MeetingStatus } from '../../../types/meetings';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const CREATOR_ID = '33333333-3333-4333-8333-333333333333';
const FACILITATOR_ID = '44444444-4444-4444-8444-444444444444';
const SECRETARY_ID = '55555555-5555-4555-8555-555555555555';
const COMMUNITY_ID = 'gc-uuid-1111';
const OTHER_COMMUNITY_ID = 'gc-uuid-2222';

function buildUser(overrides?: Partial<MeetingPolicyUser>): MeetingPolicyUser {
  return {
    id: USER_ID,
    highestRole: 'docente',
    userRoles: [],
    ...overrides,
  };
}

function buildRole(overrides?: Partial<Record<string, unknown>>): UserRole {
  return {
    id: 'role-uuid-1',
    user_id: USER_ID,
    role_type: 'lider_comunidad',
    community_id: COMMUNITY_ID,
    school_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as UserRole;
}

function buildMeeting(overrides?: Partial<MeetingPolicyInput>): MeetingPolicyInput {
  return {
    id: 'meeting-uuid-1',
    status: 'borrador' as MeetingStatus,
    created_by: CREATOR_ID,
    facilitator_id: FACILITATOR_ID,
    secretary_id: SECRETARY_ID,
    community_id: COMMUNITY_ID,
    ...overrides,
  };
}

function buildAttendee(
  user_id: string,
  role: MeetingAttendeePolicyInput['role']
): MeetingAttendeePolicyInput {
  return { user_id, role };
}

describe('meeting-policy helpers', () => {
  describe('canEditMeeting', () => {
    it('allows admin to edit any meeting regardless of status', () => {
      const user = buildUser({ highestRole: 'admin', id: OTHER_USER_ID });
      expect(canEditMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'en_progreso' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'cancelada' }), [])).toBe(true);
    });

    it('allows consultor to edit any meeting regardless of status (matches SQL short-circuit)', () => {
      const user = buildUser({ highestRole: 'consultor', id: OTHER_USER_ID });
      expect(canEditMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'en_progreso' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'cancelada' }), [])).toBe(true);
    });

    it('allows consultor even when unrelated to the meeting community', () => {
      const user = buildUser({ highestRole: 'consultor', id: OTHER_USER_ID });
      expect(
        canEditMeeting(user, buildMeeting({ community_id: OTHER_COMMUNITY_ID }), [])
      ).toBe(true);
    });

    it('allows creator to edit editable-status meetings', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(canEditMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(true);
      expect(canEditMeeting(user, buildMeeting({ status: 'en_progreso' }), [])).toBe(true);
    });

    it('denies creator once meeting is completada or cancelada', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(canEditMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(false);
      expect(canEditMeeting(user, buildMeeting({ status: 'cancelada' }), [])).toBe(false);
    });

    it('allows designated facilitator by id', () => {
      const user = buildUser({ id: FACILITATOR_ID });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(true);
    });

    it('allows designated secretary by id', () => {
      const user = buildUser({ id: SECRETARY_ID });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(true);
    });

    it('allows attendee with role co_editor', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'co_editor')];
      expect(canEditMeeting(user, buildMeeting(), attendees)).toBe(true);
    });

    it('allows attendee with role facilitator even without facilitator_id match', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'facilitator')];
      expect(canEditMeeting(user, buildMeeting({ facilitator_id: undefined }), attendees)).toBe(
        true
      );
    });

    it('allows attendee with role secretary even without secretary_id match', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'secretary')];
      expect(canEditMeeting(user, buildMeeting({ secretary_id: undefined }), attendees)).toBe(true);
    });

    it('denies attendee with role participant', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'participant')];
      expect(canEditMeeting(user, buildMeeting(), attendees)).toBe(false);
    });

    it('denies attendee with role observer', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'observer')];
      expect(canEditMeeting(user, buildMeeting(), attendees)).toBe(false);
    });

    it('allows active lider_comunidad for the meeting community', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildRole({ community_id: COMMUNITY_ID })],
      });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(true);
    });

    it('denies lider_comunidad of a different community', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildRole({ community_id: OTHER_COMMUNITY_ID })],
      });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(false);
    });

    it('ignores inactive lider_comunidad role', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildRole({ community_id: COMMUNITY_ID, is_active: false })],
      });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(false);
    });

    it('denies lider_comunidad once meeting is completada', () => {
      const user = buildUser({
        highestRole: 'lider_comunidad',
        userRoles: [buildRole({ community_id: COMMUNITY_ID })],
      });
      expect(canEditMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(false);
    });

    it('denies creator on pospuesta status (not in editable set)', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(canEditMeeting(user, buildMeeting({ status: 'pospuesta' }), [])).toBe(false);
    });

    it('denies unrelated docente with no roles or attendee record', () => {
      const user = buildUser({ id: OTHER_USER_ID });
      expect(canEditMeeting(user, buildMeeting(), [])).toBe(false);
    });

    it('denies creator when meeting community_id is missing and status is completada', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(
        canEditMeeting(user, buildMeeting({ status: 'completada', community_id: null }), [])
      ).toBe(false);
    });
  });

  describe('canFinalizeMeeting', () => {
    it('allows admin on borrador meeting', () => {
      const user = buildUser({ highestRole: 'admin', id: OTHER_USER_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
    });

    it('allows consultor on borrador meeting', () => {
      const user = buildUser({ highestRole: 'consultor', id: OTHER_USER_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
    });

    it('denies consultor on programada meeting (status must be borrador)', () => {
      const user = buildUser({ highestRole: 'consultor', id: OTHER_USER_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(false);
    });

    it('denies admin on programada meeting (status must be borrador)', () => {
      const user = buildUser({ highestRole: 'admin', id: OTHER_USER_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(false);
    });

    it('denies admin on completada meeting', () => {
      const user = buildUser({ highestRole: 'admin', id: OTHER_USER_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'completada' }), [])).toBe(false);
    });

    it('allows creator on borrador', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(true);
    });

    it('denies creator on programada', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'programada' }), [])).toBe(false);
    });

    it('allows co_editor attendee on borrador', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'co_editor')];
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), attendees)).toBe(true);
    });

    it('denies unrelated user on borrador', () => {
      const user = buildUser({ id: OTHER_USER_ID });
      expect(canFinalizeMeeting(user, buildMeeting({ status: 'borrador' }), [])).toBe(false);
    });
  });

  describe('canResolveCommitment', () => {
    it('allows the assignee even if they cannot edit the meeting', () => {
      const user = buildUser({ id: OTHER_USER_ID });
      const meeting = buildMeeting({ status: 'completada' });
      expect(
        canResolveCommitment(user, { assigned_to: OTHER_USER_ID }, meeting, [])
      ).toBe(true);
    });

    it('allows an admin even when not the assignee', () => {
      const user = buildUser({ highestRole: 'admin', id: OTHER_USER_ID });
      expect(
        canResolveCommitment(user, { assigned_to: CREATOR_ID }, buildMeeting(), [])
      ).toBe(true);
    });

    it('allows a consultor even when not the assignee and meeting is completada', () => {
      const user = buildUser({ highestRole: 'consultor', id: OTHER_USER_ID });
      const meeting = buildMeeting({ status: 'completada' });
      expect(
        canResolveCommitment(user, { assigned_to: CREATOR_ID }, meeting, [])
      ).toBe(true);
    });

    it('allows the creator (who can edit) even when not the assignee', () => {
      const user = buildUser({ id: CREATOR_ID });
      expect(
        canResolveCommitment(user, { assigned_to: OTHER_USER_ID }, buildMeeting(), [])
      ).toBe(true);
    });

    it('allows co_editor attendee on editable meeting', () => {
      const user = buildUser();
      const attendees = [buildAttendee(USER_ID, 'co_editor')];
      expect(
        canResolveCommitment(user, { assigned_to: OTHER_USER_ID }, buildMeeting(), attendees)
      ).toBe(true);
    });

    it('denies unrelated user who is not the assignee', () => {
      const user = buildUser({ id: OTHER_USER_ID });
      expect(
        canResolveCommitment(user, { assigned_to: CREATOR_ID }, buildMeeting(), [])
      ).toBe(false);
    });

    it('denies non-admin non-assignee once meeting is completada', () => {
      const user = buildUser({ id: CREATOR_ID });
      const meeting = buildMeeting({ status: 'completada' });
      expect(
        canResolveCommitment(user, { assigned_to: OTHER_USER_ID }, meeting, [])
      ).toBe(false);
    });
  });
});
