/**
 * Canonical query scope for session COLLECTIONS.
 *
 * `canViewSession()` (session-policy.ts) decides access to ONE session from a
 * fetched row. Any endpoint that returns a *set* of sessions has to express the
 * same decision as a query filter instead — it cannot fetch the world and then
 * filter in memory without breaking pagination and `count: 'exact'`.
 *
 * That translation used to be written out inline at each collection endpoint,
 * and the copies diverged: the list GET picked ONE scope by `highestRole` (a
 * consultor got the school filter and nothing else), while the batch iCal
 * export scoped from every row carrying a `community_id` — no `is_active`, no
 * consultor branch. So the two endpoints disagreed with each other AND with the
 * detail endpoint about which sessions exist.
 *
 * This module is that translation, once. Both `GET /api/sessions` and
 * `GET /api/sessions/ical` consume it, so they cannot drift again. It mirrors
 * `canViewSession()` clause for clause:
 *
 *   - admin                  → every session          (`{kind:'all'}`)
 *   - global consultor       → every session          (`{kind:'all'}`)
 *   - school-scoped consultor→ their schools, UNIONed with their community
 *                              memberships
 *   - anyone else            → their ACTIVE community memberships
 *   - none of the above      → nothing                (`{kind:'none'}`)
 *
 * The consultor branch is consulted only when consultor is the HIGHEST role,
 * because that is exactly what `canViewSession()` does.
 */

import { Validators } from '../types/api-auth.types';
import { getConsultorAccess } from './session-policy';
import type { UserRole } from '../../types/roles';

export type SessionScope =
  /** No filter: the caller may see every active session. */
  | { kind: 'all' }
  /** No scope at all: the caller may see nothing. Callers must short-circuit. */
  | { kind: 'none' }
  /**
   * A PostgREST `.or()` argument unioning every scope the caller holds.
   * Interpolation-safe by construction: school ids survive `Number.isFinite`
   * and community ids survive `Validators.isUUID` before they reach the string,
   * and both come from `user_roles`, never from the request.
   */
  | { kind: 'union'; orClause: string };

/**
 * Build the collection-query scope for a caller.
 *
 * @param highestRole the value from `getHighestRole()`. Callers must already
 *   have rejected `null` (no roles → 403) before getting here; a `null` passed
 *   in anyway yields the narrowest scope the caller's rows justify.
 * @param userRoles the caller's roles as returned by `getUserRoles()`.
 */
export function buildSessionScope(
  highestRole: string | null,
  userRoles: UserRole[]
): SessionScope {
  if (highestRole === 'admin') {
    return { kind: 'all' };
  }

  // canViewSession only consults the consultor branch when consultor IS the
  // highest role, so this mirrors it exactly.
  const consultorAccess =
    highestRole === 'consultor'
      ? getConsultorAccess(userRoles)
      : { isGlobal: false, schoolIds: [] as (string | number)[] };

  // A global consultor (school_id IS NULL) already sees everything; any
  // additional community scope is a subset, so no filter is applied.
  if (consultorAccess.isGlobal) {
    return { kind: 'all' };
  }

  const scopedSchoolIds = consultorAccess.schoolIds
    .map((value) => (typeof value === 'number' ? value : parseInt(String(value), 10)))
    .filter((value) => Number.isFinite(value));

  // Only ACTIVE role rows grant community scope — the same rule
  // canViewSession() applies on the detail endpoint. Cache-fallback rows carry
  // `is_active: null`, so they are excluded here too.
  const communityIds = (userRoles || [])
    .filter((r) => r.community_id && r.is_active)
    .map((r) => String(r.community_id))
    .filter((id, index, arr) => arr.indexOf(id) === index) // deduplicate
    .filter((id) => Validators.isUUID(id)); // never interpolate a non-UUID

  if (scopedSchoolIds.length === 0 && communityIds.length === 0) {
    return { kind: 'none' };
  }

  const scopeClauses: string[] = [];
  if (scopedSchoolIds.length > 0) {
    scopeClauses.push(`school_id.in.(${scopedSchoolIds.join(',')})`);
  }
  if (communityIds.length > 0) {
    scopeClauses.push(
      `growth_community_id.in.(${communityIds.map((id) => `"${id}"`).join(',')})`
    );
  }

  return { kind: 'union', orClause: scopeClauses.join(',') };
}

/**
 * Draft (`borrador`) sessions are hidden from everyone who is neither admin nor
 * consultor. Shared so the list and the batch export cannot answer this
 * differently either.
 */
export function hidesDraftSessions(highestRole: string | null): boolean {
  return highestRole !== 'admin' && highestRole !== 'consultor';
}
