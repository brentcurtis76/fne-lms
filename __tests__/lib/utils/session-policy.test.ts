// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  canViewSession,
  canEditSession,
  canContributeToSession,
  SessionAccessContext,
} from '../../../lib/utils/session-policy';
import { UserRole } from '../../../utils/roleUtils';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SCHOOL_ID = 1;
const GC_ID = 'gc-uuid-1111';

function buildContext(overrides?: Partial<SessionAccessContext>): SessionAccessContext {
  return {
    highestRole: 'consultor',
    userRoles: [],
    session: {
      id: 'session-uuid-1111',
      school_id: SCHOOL_ID,
      growth_community_id: GC_ID,
      status: 'programada',
    },
    userId: USER_ID,
    isFacilitator: false,
    ...overrides,
  };
}

function buildUserRole(overrides?: Partial<UserRole>): UserRole {
  return {
    id: 'role-uuid-1111',
    user_id: USER_ID,
    role_type: 'consultor',
    school_id: SCHOOL_ID,
    community_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('session-policy helpers', () => {
  describe('canViewSession', () => {
    it('should allow admin to view any session', () => {
      const ctx = buildContext({ highestRole: 'admin' });
      expect(canViewSession(ctx)).toBe(true);
    });

    it('should allow consultor to view session at their school', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
      });
      expect(canViewSession(ctx)).toBe(true);
    });

    it('should deny consultor viewing session at different school', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [buildUserRole({ school_id: 999 })],
      });
      expect(canViewSession(ctx)).toBe(false);
    });

    it('should allow consultor viewing session if inactive at wrong school but no active roles', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [buildUserRole({ school_id: 999, is_active: false })],
      });
      expect(canViewSession(ctx)).toBe(false);
    });

    it('should allow GC member to view their community session', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: GC_ID,
            school_id: null,
          }),
        ],
      });
      expect(canViewSession(ctx)).toBe(true);
    });

    it('should deny GC member viewing session in different community', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: 'different-gc-id',
            school_id: null,
          }),
        ],
      });
      expect(canViewSession(ctx)).toBe(false);
    });

    it('should deny user with no relevant roles', () => {
      const ctx = buildContext({
        highestRole: 'estudiante',
        userRoles: [],
      });
      expect(canViewSession(ctx)).toBe(false);
    });

    it('should ignore inactive consultant roles when checking school access', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({
            school_id: SCHOOL_ID,
            is_active: false,
          }),
        ],
      });
      expect(canViewSession(ctx)).toBe(false);
    });
  });

  describe('canEditSession', () => {
    it('should allow admin to edit any session', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        isFacilitator: false,
      });
      expect(canEditSession(ctx)).toBe(true);
    });

    it('should allow facilitator to edit', () => {
      const ctx = buildContext({
        isFacilitator: true,
      });
      expect(canEditSession(ctx)).toBe(true);
    });

    it('should deny non-facilitator consultor from editing', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
        isFacilitator: false,
      });
      expect(canEditSession(ctx)).toBe(false);
    });

    it('should allow GC leader to edit', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: GC_ID,
            school_id: null,
          }),
        ],
        isFacilitator: false,
      });
      expect(canEditSession(ctx)).toBe(true);
    });

    it('should deny GC leader editing different community session', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: 'different-gc-id',
            school_id: null,
          }),
        ],
        isFacilitator: false,
      });
      expect(canEditSession(ctx)).toBe(false);
    });

    it('should ignore inactive GC leader role', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: GC_ID,
            is_active: false,
            school_id: null,
          }),
        ],
        isFacilitator: false,
      });
      expect(canEditSession(ctx)).toBe(false);
    });
  });

  describe('canContributeToSession', () => {
    it('should allow facilitator to contribute to programada session', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'programada', id: 'uuid' },
        isFacilitator: true,
      });
      expect(canContributeToSession(ctx)).toBe(true);
    });

    it('should allow facilitator to contribute to iniciada session', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'iniciada', id: 'uuid' },
        isFacilitator: true,
      });
      expect(canContributeToSession(ctx)).toBe(true);
    });

    it('should deny contribution to completada session', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'completada', id: 'uuid' },
        isFacilitator: true,
      });
      expect(canContributeToSession(ctx)).toBe(false);
    });

    it('should deny contribution to cancelada session', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'cancelada', id: 'uuid' },
        isFacilitator: true,
      });
      expect(canContributeToSession(ctx)).toBe(false);
    });

    it('should deny non-facilitator from contributing even to open session', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [buildUserRole({ school_id: SCHOOL_ID })],
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'programada', id: 'uuid' },
        isFacilitator: false,
      });
      expect(canContributeToSession(ctx)).toBe(false);
    });

    it('should allow GC leader to contribute to open session', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: GC_ID,
            school_id: null,
          }),
        ],
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'programada', id: 'uuid' },
        isFacilitator: false,
      });
      expect(canContributeToSession(ctx)).toBe(true);
    });

    it('should deny GC leader contribution to completada session', () => {
      const ctx = buildContext({
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            community_id: GC_ID,
            school_id: null,
          }),
        ],
        session: { school_id: SCHOOL_ID, growth_community_id: GC_ID, status: 'completada', id: 'uuid' },
        isFacilitator: false,
      });
      expect(canContributeToSession(ctx)).toBe(false);
    });
  });
});
