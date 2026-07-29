// @vitest-environment node
/**
 * The shared collection scope builder (Z1a-5).
 *
 * `GET /api/sessions` and `GET /api/sessions/ical` both consume this, so its
 * behaviour is asserted through both endpoints already
 * (`sessions-list-scope-union.test.ts`, `ical-scope-union.test.ts`). What those
 * cannot reach is the interpolation guard: the `.or()` argument is the one
 * filter in this phase assembled as a string, so the rejection of values that
 * must never reach it is pinned here directly.
 *
 * Synthetic data only.
 */
import { describe, it, expect } from 'vitest';
import { buildSessionScope, hidesDraftSessions } from '../../../lib/utils/session-scope';
import type { UserRole } from '../../../types/roles';

const SCHOOL_ID = 7;
const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';
const OTHER_COMMUNITY_ID = 'c0222222-2222-4222-8222-222222222222';

function role(overrides: Partial<UserRole> & { role_type: UserRole['role_type'] }): UserRole {
  return {
    id: 'ur-x',
    user_id: 'u-0001',
    is_active: true,
    assigned_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as UserRole;
}

describe('buildSessionScope — mirrors canViewSession()', () => {
  it('admin sees everything', () => {
    expect(buildSessionScope('admin', [role({ role_type: 'admin' })])).toEqual({ kind: 'all' });
  });

  it('a global consultor (school_id NULL) sees everything', () => {
    expect(
      buildSessionScope('consultor', [role({ role_type: 'consultor' })])
    ).toEqual({ kind: 'all' });
  });

  it('a school-scoped consultor gets their schools', () => {
    expect(
      buildSessionScope('consultor', [
        role({ role_type: 'consultor', school_id: String(SCHOOL_ID) }),
      ])
    ).toEqual({ kind: 'union', orClause: `school_id.in.(${SCHOOL_ID})` });
  });

  it('a non-consultor gets their communities only — the consultor branch is not consulted', () => {
    // A `consultor` row on a user whose HIGHEST role is not consultor must not
    // widen the scope; canViewSession() ignores it the same way.
    expect(
      buildSessionScope('docente', [
        role({ role_type: 'consultor', school_id: String(SCHOOL_ID) }),
        role({ role_type: 'docente', community_id: COMMUNITY_ID }),
      ])
    ).toEqual({ kind: 'union', orClause: `growth_community_id.in.("${COMMUNITY_ID}")` });
  });

  it('a mixed consultor unions school scope with community memberships', () => {
    const scope = buildSessionScope('consultor', [
      role({ role_type: 'consultor', school_id: String(SCHOOL_ID) }),
      role({ role_type: 'docente', community_id: OTHER_COMMUNITY_ID }),
    ]);

    expect(scope).toEqual({
      kind: 'union',
      orClause: `school_id.in.(${SCHOOL_ID}),growth_community_id.in.("${OTHER_COMMUNITY_ID}")`,
    });
  });

  it('duplicate community memberships are deduplicated', () => {
    const scope = buildSessionScope('docente', [
      role({ role_type: 'docente', community_id: COMMUNITY_ID }),
      role({ role_type: 'lider_comunidad', community_id: COMMUNITY_ID }),
    ]);

    expect(scope).toEqual({
      kind: 'union',
      orClause: `growth_community_id.in.("${COMMUNITY_ID}")`,
    });
  });

  it('no roles at all → no scope', () => {
    expect(buildSessionScope('docente', [])).toEqual({ kind: 'none' });
  });

  it('an inactive community membership grants nothing', () => {
    expect(
      buildSessionScope('docente', [
        role({ role_type: 'docente', community_id: COMMUNITY_ID, is_active: false }),
      ])
    ).toEqual({ kind: 'none' });
  });

  it('a cache-fallback row grants nothing (is_active null)', () => {
    expect(
      buildSessionScope('docente', [
        role({
          role_type: 'docente',
          community_id: COMMUNITY_ID,
          is_active: null as unknown as boolean,
          from_cache: true,
        }),
      ])
    ).toEqual({ kind: 'none' });
  });
});

describe('buildSessionScope — the interpolation guard', () => {
  it('drops a non-UUID community id rather than interpolating it', () => {
    expect(
      buildSessionScope('docente', [
        role({ role_type: 'docente', community_id: "1' OR '1'='1" }),
      ])
    ).toEqual({ kind: 'none' });
  });

  it('keeps the valid community ids when one sibling is malformed', () => {
    const scope = buildSessionScope('docente', [
      role({ role_type: 'docente', community_id: 'not-a-uuid' }),
      role({ role_type: 'docente', community_id: COMMUNITY_ID }),
    ]);

    expect(scope).toEqual({
      kind: 'union',
      orClause: `growth_community_id.in.("${COMMUNITY_ID}")`,
    });
  });

  it('drops a non-numeric consultor school id rather than interpolating it', () => {
    expect(
      buildSessionScope('consultor', [
        role({ role_type: 'consultor', school_id: 'DROP TABLE', is_active: true }),
      ])
    ).toEqual({ kind: 'none' });
  });

  it('coerces a numeric-string school id to a number', () => {
    expect(
      buildSessionScope('consultor', [role({ role_type: 'consultor', school_id: '7' })])
    ).toEqual({ kind: 'union', orClause: 'school_id.in.(7)' });
  });
});

describe('hidesDraftSessions', () => {
  it('admins and consultors see drafts', () => {
    expect(hidesDraftSessions('admin')).toBe(false);
    expect(hidesDraftSessions('consultor')).toBe(false);
  });

  it('everyone else does not', () => {
    expect(hidesDraftSessions('docente')).toBe(true);
    expect(hidesDraftSessions('lider_comunidad')).toBe(true);
    expect(hidesDraftSessions('equipo_directivo')).toBe(true);
    expect(hidesDraftSessions(null)).toBe(true);
  });
});
