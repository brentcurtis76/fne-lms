// @vitest-environment node
// Phase E2 — Offline RBAC fuzz harness.
// Generates a role × session matrix (~100 combinations) and asserts
// canViewSession / canEditSession / canContributeToSession against an
// embedded spec table. Pure function calls, no Supabase.

import { describe, it, expect } from 'vitest';
import {
  canViewSession,
  canEditSession,
  canContributeToSession,
} from '../../lib/utils/session-policy';
import {
  buildContext,
  buildUserRole,
  SCHOOL_ID,
  GC_ID,
  USER_ID,
} from '../helpers/session-policy-factories';

// --- scenario vocabulary --------------------------------------------------

type UserKind =
  | 'admin'
  | 'consultor_global'
  | 'consultor_school_A'
  | 'consultor_school_B'
  | 'consultor_inactive_A'
  | 'lider_comunidad_GC'
  | 'lider_comunidad_other_GC'
  | 'docente_school_A'
  | 'estudiante'
  | 'consultor_A_plus_admin'
  | 'consultor_A_active_plus_B_inactive';

type SessionKind =
  | 'school_A_GC_programada'
  | 'school_A_GC_completada'
  | 'school_A_GC_cancelada'
  | 'school_B_GC_programada'
  | 'school_A_other_GC_programada'
  | 'school_A_GC_pendiente_informe'
  | 'school_A_GC_borrador';

const SCHOOL_A = SCHOOL_ID;
const SCHOOL_B = 999;
const OTHER_GC = 'gc-uuid-other';

function buildUser(kind: UserKind) {
  switch (kind) {
    case 'admin':
      return {
        highestRole: 'admin',
        userRoles: [buildUserRole({ role_type: 'admin', school_id: null })],
        isFacilitator: false,
      };
    case 'consultor_global':
      return {
        highestRole: 'consultor',
        userRoles: [buildUserRole({ role_type: 'consultor', school_id: null })],
        isFacilitator: false,
      };
    case 'consultor_school_A':
      return {
        highestRole: 'consultor',
        userRoles: [buildUserRole({ role_type: 'consultor', school_id: SCHOOL_A })],
        isFacilitator: false,
      };
    case 'consultor_school_B':
      return {
        highestRole: 'consultor',
        userRoles: [buildUserRole({ role_type: 'consultor', school_id: SCHOOL_B })],
        isFacilitator: false,
      };
    case 'consultor_inactive_A':
      return {
        highestRole: 'consultor',
        userRoles: [buildUserRole({ role_type: 'consultor', school_id: SCHOOL_A, is_active: false })],
        isFacilitator: false,
      };
    case 'lider_comunidad_GC':
      return {
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            school_id: SCHOOL_A,
            community_id: GC_ID,
          }),
        ],
        isFacilitator: false,
      };
    case 'lider_comunidad_other_GC':
      return {
        highestRole: 'lider_comunidad',
        userRoles: [
          buildUserRole({
            role_type: 'lider_comunidad',
            school_id: SCHOOL_A,
            community_id: OTHER_GC,
          }),
        ],
        isFacilitator: false,
      };
    case 'docente_school_A':
      return {
        highestRole: 'docente',
        userRoles: [
          buildUserRole({
            role_type: 'docente',
            school_id: SCHOOL_A,
            community_id: GC_ID,
          }),
        ],
        isFacilitator: false,
      };
    case 'estudiante':
      return {
        highestRole: 'docente',
        userRoles: [],
        isFacilitator: false,
      };
    case 'consultor_A_plus_admin':
      return {
        highestRole: 'admin',
        userRoles: [
          buildUserRole({ role_type: 'admin', school_id: null }),
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_A }),
        ],
        isFacilitator: false,
      };
    case 'consultor_A_active_plus_B_inactive':
      return {
        highestRole: 'consultor',
        userRoles: [
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_A, is_active: true }),
          buildUserRole({ role_type: 'consultor', school_id: SCHOOL_B, is_active: false }),
        ],
        isFacilitator: false,
      };
  }
}

function buildSession(kind: SessionKind) {
  switch (kind) {
    case 'school_A_GC_programada':
      return { id: 's1', school_id: SCHOOL_A, growth_community_id: GC_ID, status: 'programada' };
    case 'school_A_GC_completada':
      return { id: 's2', school_id: SCHOOL_A, growth_community_id: GC_ID, status: 'completada' };
    case 'school_A_GC_cancelada':
      return { id: 's3', school_id: SCHOOL_A, growth_community_id: GC_ID, status: 'cancelada' };
    case 'school_B_GC_programada':
      return { id: 's4', school_id: SCHOOL_B, growth_community_id: GC_ID, status: 'programada' };
    case 'school_A_other_GC_programada':
      return { id: 's5', school_id: SCHOOL_A, growth_community_id: OTHER_GC, status: 'programada' };
    case 'school_A_GC_pendiente_informe':
      return { id: 's6', school_id: SCHOOL_A, growth_community_id: GC_ID, status: 'pendiente_informe' };
    case 'school_A_GC_borrador':
      return { id: 's7', school_id: SCHOOL_A, growth_community_id: GC_ID, status: 'borrador' };
  }
}

type Expectations = {
  view: boolean;
  edit: boolean;
  contribute: boolean;
};

// Expected policy outputs, written by hand from the rules in
// lib/utils/session-policy.ts so a regression would surface here.
function expected(user: UserKind, session: SessionKind, isFacilitator: boolean): Expectations {
  const isWritableStatus =
    session !== 'school_A_GC_completada' && session !== 'school_A_GC_cancelada';
  const isSchoolA = session !== 'school_B_GC_programada';
  const isGCMatching = session !== 'school_A_other_GC_programada';

  let view = false;
  let edit = false;

  switch (user) {
    case 'admin':
    case 'consultor_A_plus_admin':
      // Admin wins everything; facilitator flag irrelevant.
      view = true;
      edit = true;
      break;
    case 'consultor_global':
      view = true;
      edit = isFacilitator;
      break;
    case 'consultor_school_A':
    case 'consultor_A_active_plus_B_inactive':
      view = isSchoolA;
      edit = isFacilitator;
      break;
    case 'consultor_school_B':
      view = !isSchoolA;
      edit = isFacilitator;
      break;
    case 'consultor_inactive_A':
      view = false;
      edit = isFacilitator;
      break;
    case 'lider_comunidad_GC':
      view = isGCMatching;
      edit = isGCMatching || isFacilitator;
      break;
    case 'lider_comunidad_other_GC':
      view = !isGCMatching;
      edit = !isGCMatching || isFacilitator;
      break;
    case 'docente_school_A':
      view = isGCMatching;
      edit = isFacilitator;
      break;
    case 'estudiante':
      view = false;
      edit = isFacilitator;
      break;
  }

  const contribute = edit && isWritableStatus;
  return { view, edit, contribute };
}

const USERS: UserKind[] = [
  'admin',
  'consultor_global',
  'consultor_school_A',
  'consultor_school_B',
  'consultor_inactive_A',
  'lider_comunidad_GC',
  'lider_comunidad_other_GC',
  'docente_school_A',
  'estudiante',
  'consultor_A_plus_admin',
  'consultor_A_active_plus_B_inactive',
];

const SESSIONS: SessionKind[] = [
  'school_A_GC_programada',
  'school_A_GC_completada',
  'school_A_GC_cancelada',
  'school_B_GC_programada',
  'school_A_other_GC_programada',
  'school_A_GC_pendiente_informe',
  'school_A_GC_borrador',
];

describe('stress: RBAC fuzz matrix (role × session × facilitator flag)', () => {
  // Test matrix size: users × sessions × 2 (facilitator boolean) ≈ 154 combos.
  it('every combination matches the embedded spec', () => {
    const failures: string[] = [];

    for (const userKind of USERS) {
      const userPart = buildUser(userKind);
      for (const sessionKind of SESSIONS) {
        for (const isFacilitator of [false, true]) {
          const ctx = buildContext({
            ...userPart,
            session: buildSession(sessionKind),
            userId: USER_ID,
            isFacilitator,
          });

          const actual: Expectations = {
            view: canViewSession(ctx),
            edit: canEditSession(ctx),
            contribute: canContributeToSession(ctx),
          };
          const want = expected(userKind, sessionKind, isFacilitator);

          if (
            actual.view !== want.view ||
            actual.edit !== want.edit ||
            actual.contribute !== want.contribute
          ) {
            failures.push(
              `${userKind} × ${sessionKind} × facilitator=${isFacilitator}: ` +
                `want ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('completada and cancelada sessions always deny contribute (even for admin)', () => {
    for (const userKind of USERS) {
      const userPart = buildUser(userKind);
      for (const sessionKind of ['school_A_GC_completada', 'school_A_GC_cancelada'] as SessionKind[]) {
        for (const isFacilitator of [false, true]) {
          const ctx = buildContext({
            ...userPart,
            session: buildSession(sessionKind),
            userId: USER_ID,
            isFacilitator,
          });
          expect(
            canContributeToSession(ctx),
            `${userKind} × ${sessionKind} × facilitator=${isFacilitator} should not contribute`
          ).toBe(false);
        }
      }
    }
  });

  it('admin can always view and edit, regardless of school or community match', () => {
    const user = buildUser('admin');
    for (const sessionKind of SESSIONS) {
      const ctx = buildContext({
        ...user,
        session: buildSession(sessionKind),
        userId: USER_ID,
        isFacilitator: false,
      });
      expect(canViewSession(ctx)).toBe(true);
      expect(canEditSession(ctx)).toBe(true);
    }
  });

  it('global consultor can view any session (including school B and other GC)', () => {
    const user = buildUser('consultor_global');
    for (const sessionKind of SESSIONS) {
      const ctx = buildContext({
        ...user,
        session: buildSession(sessionKind),
        userId: USER_ID,
        isFacilitator: false,
      });
      expect(canViewSession(ctx)).toBe(true);
    }
  });
});
