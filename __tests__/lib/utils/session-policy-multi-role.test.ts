// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  canViewSession,
  canEditSession,
  canContributeToSession,
  getConsultorAccess,
} from '../../../lib/utils/session-policy';
import {
  buildContext,
  buildUserRole,
  SCHOOL_ID,
  GC_ID,
} from '../../helpers/session-policy-factories';

describe('session-policy multi-role merging', () => {
  describe('consultor + admin', () => {
    it('admin privileges win: can view session at unrelated school even with inactive consultor role', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        userRoles: [
          buildUserRole({ role_type: 'admin', school_id: null, is_active: true }),
          buildUserRole({ role_type: 'consultor', school_id: 999, is_active: false }),
        ],
        session: {
          id: 'session-uuid-2222',
          school_id: 42,
          growth_community_id: 'unrelated-gc',
          status: 'programada',
        },
      });

      expect(canViewSession(ctx)).toBe(true);
      expect(canEditSession(ctx)).toBe(true);
      expect(canContributeToSession(ctx)).toBe(true);
    });

    it('admin privileges win even for completada session for edit, but contribute is denied', () => {
      const ctx = buildContext({
        highestRole: 'admin',
        userRoles: [
          buildUserRole({ role_type: 'admin', school_id: null }),
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID }),
        ],
        session: {
          id: 'session-uuid-3333',
          school_id: SCHOOL_ID,
          growth_community_id: GC_ID,
          status: 'completada',
        },
      });

      expect(canViewSession(ctx)).toBe(true);
      expect(canEditSession(ctx)).toBe(true);
      expect(canContributeToSession(ctx)).toBe(false);
    });
  });

  describe('active + inactive consultor roles at same school', () => {
    it('active role wins: view granted even with inactive duplicate', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: true }),
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: false }),
        ],
      });
      expect(canViewSession(ctx)).toBe(true);
    });

    it('inactive-only roles deny access', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: false }),
          buildUserRole({ role_type: 'consultor', school_id: 999, is_active: false }),
        ],
      });
      expect(canViewSession(ctx)).toBe(false);
    });
  });

  describe('global + school-scoped consultor', () => {
    it('global consultor beats school-scoped: isGlobal=true regardless of other school rows', () => {
      const access = getConsultorAccess([
        buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: true }),
        buildUserRole({ role_type: 'consultor', school_id: null, is_active: true }),
      ]);
      expect(access.isGlobal).toBe(true);
      expect(access.schoolIds).toEqual([]);
    });

    it('global consultor can view session at any school', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({ role_type: 'consultor', school_id: null, is_active: true }),
        ],
        session: {
          id: 'session-uuid-4444',
          school_id: 999,
          growth_community_id: 'unrelated-gc',
          status: 'programada',
        },
      });
      expect(canViewSession(ctx)).toBe(true);
    });

    it('inactive global + active school-scoped falls back to school-scoped schoolIds', () => {
      const access = getConsultorAccess([
        buildUserRole({ role_type: 'consultor', school_id: null, is_active: false }),
        buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: true }),
      ]);
      expect(access.isGlobal).toBe(false);
      expect(access.schoolIds).toEqual([String(SCHOOL_ID)]);
    });
  });

  describe('consultor + docente', () => {
    it('consultor at school wins over docente-only for viewing other schools', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({ role_type: 'docente', school_id: 500, is_active: true }),
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: true }),
        ],
      });
      expect(canViewSession(ctx)).toBe(true);
    });

    it('docente-only user without consultor role cannot view arbitrary session', () => {
      const ctx = buildContext({
        highestRole: 'docente',
        userRoles: [
          buildUserRole({ role_type: 'docente', school_id: SCHOOL_ID, is_active: true }),
        ],
      });
      // docente has no special session access path in the policy
      expect(canViewSession(ctx)).toBe(false);
      expect(canEditSession(ctx)).toBe(false);
    });

    it('docente + inactive consultor at session school still denies access', () => {
      const ctx = buildContext({
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({ role_type: 'docente', school_id: SCHOOL_ID, is_active: true }),
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID, is_active: false }),
        ],
      });
      expect(canViewSession(ctx)).toBe(false);
    });
  });

  describe('canContributeToSession — completada/cancelada denied for everyone', () => {
    const lockedStatuses = ['completada', 'cancelada'] as const;

    for (const status of lockedStatuses) {
      it(`admin is denied contribution on ${status} session`, () => {
        const ctx = buildContext({
          highestRole: 'admin',
          userRoles: [buildUserRole({ role_type: 'admin', school_id: null })],
          session: {
            id: 'session-uuid-5',
            school_id: SCHOOL_ID,
            growth_community_id: GC_ID,
            status,
          },
          isFacilitator: true,
        });
        expect(canContributeToSession(ctx)).toBe(false);
      });

      it(`facilitator is denied contribution on ${status} session`, () => {
        const ctx = buildContext({
          highestRole: 'consultor',
          userRoles: [buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID })],
          session: {
            id: 'session-uuid-6',
            school_id: SCHOOL_ID,
            growth_community_id: GC_ID,
            status,
          },
          isFacilitator: true,
        });
        expect(canContributeToSession(ctx)).toBe(false);
      });

      it(`lider_comunidad is denied contribution on ${status} session in their GC`, () => {
        const ctx = buildContext({
          highestRole: 'lider_comunidad',
          userRoles: [
            buildUserRole({
              role_type: 'lider_comunidad',
              community_id: GC_ID,
              school_id: null,
              is_active: true,
            }),
          ],
          session: {
            id: 'session-uuid-7',
            school_id: SCHOOL_ID,
            growth_community_id: GC_ID,
            status,
          },
          isFacilitator: false,
        });
        expect(canContributeToSession(ctx)).toBe(false);
      });

      it(`admin + facilitator + GC leader all denied contribution on ${status} (merged role)`, () => {
        const ctx = buildContext({
          highestRole: 'admin',
          userRoles: [
            buildUserRole({ role_type: 'admin', school_id: null }),
            buildUserRole({
              role_type: 'lider_comunidad',
              community_id: GC_ID,
              school_id: null,
              is_active: true,
            }),
            buildUserRole({ role_type: 'consultor', school_id: SCHOOL_ID }),
          ],
          session: {
            id: 'session-uuid-8',
            school_id: SCHOOL_ID,
            growth_community_id: GC_ID,
            status,
          },
          isFacilitator: true,
        });
        expect(canContributeToSession(ctx)).toBe(false);
      });
    }
  });
});
