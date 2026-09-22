/**
 * Presentation capability policy for the future transversal Contexto dashboard.
 *
 * This module is intentionally dormant: it is a pure, synchronous decision over
 * data the caller already holds. It performs no I/O, reads no session,
 * environment or global state, and never mutates its input. The returned flags
 * decide what the dashboard should OFFER; they are NOT server authorization.
 * Authentication, school existence, API route checks and RLS remain the
 * authoritative enforcement layers and must keep rejecting unauthorized calls
 * regardless of what this function returns.
 *
 * Inputs:
 * - `callerId`: the authenticated user id; missing, empty or blank denies all.
 * - `roles`: raw `user_roles` rows (numeric `school_id`, as stored in the DB).
 *   Only rows whose `user_id` equals the caller exactly, with `is_active === true`
 *   and a `from_cache` that is absent or `false`, can grant anything. Rows are not
 *   expected to be prefiltered. Missing/null/empty roles deny all.
 * - `selectedSchoolId`: must be a finite positive safe integer. Anything else
 *   (including numeric strings) is invalid; no coercion or default school.
 * - `rolesError`: when the roles lookup failed (`true`, or any value other than
 *   `false`/absent), every flag is denied.
 *
 * Only `admin`, `consultor` and `equipo_directivo` grant. Other known roles,
 * unknown roles, profile-level roles, assignments and metadata never grant.
 *
 * Flags:
 * - `isAdmin`: any authoritative own `admin` row.
 * - `canSelectSchool`: admin or consultor (all registered schools), with or
 *   without a valid selected school. A plain directivo gets no global selector.
 * - `canReadSchool`: valid selected school AND (admin OR consultor OR an
 *   authoritative own `equipo_directivo` row whose valid `school_id` equals it).
 * - `canWriteSchool`: valid selected school AND (admin OR matching directivo).
 *   Consultor alone never writes.
 * - `canReadRestrictedContext`: same grant as `canWriteSchool`. Covers
 *   custom responses, Contexto completion metadata and Contexto response
 *   history; it does not widen any existing endpoint.
 *
 * Future UI must still combine `canWriteSchool` with the active assignment count
 * (0 => initial assignment, 1 => replacement, >1 => integrity warning, all rows
 * shown, no writes). Server-side replacement/history protections are unchanged.
 */

export interface TransversalContextDashboardRoleRow {
  readonly user_id: string;
  readonly role_type: string;
  readonly school_id: number | null;
  readonly is_active: boolean;
  readonly from_cache?: boolean;
}

export interface TransversalContextDashboardCapabilitiesInput {
  readonly callerId: string | null | undefined;
  readonly roles: readonly TransversalContextDashboardRoleRow[] | null | undefined;
  readonly selectedSchoolId: number | null | undefined;
  readonly rolesError?: boolean;
}

export interface TransversalContextDashboardCapabilities {
  isAdmin: boolean;
  canSelectSchool: boolean;
  canReadSchool: boolean;
  canWriteSchool: boolean;
  canReadRestrictedContext: boolean;
}

type UntrustedRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UntrustedRecord {
  return typeof value === 'object' && value !== null;
}

function isValidSchoolId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isAuthoritativeOwnRow(row: unknown, callerId: string): row is UntrustedRecord {
  return (
    isRecord(row) &&
    row.user_id === callerId &&
    row.is_active === true &&
    (row.from_cache === undefined || row.from_cache === false)
  );
}

function denyAll(): TransversalContextDashboardCapabilities {
  return {
    isAdmin: false,
    canSelectSchool: false,
    canReadSchool: false,
    canWriteSchool: false,
    canReadRestrictedContext: false,
  };
}

export function getTransversalContextDashboardCapabilities(
  input: TransversalContextDashboardCapabilitiesInput
): TransversalContextDashboardCapabilities {
  const untrusted: unknown = input;
  if (!isRecord(untrusted)) return denyAll();

  const { callerId, roles, selectedSchoolId, rolesError } = untrusted;
  if (rolesError !== undefined && rolesError !== false) return denyAll();
  if (typeof callerId !== 'string' || callerId.trim() === '') return denyAll();
  if (!Array.isArray(roles) || roles.length === 0) return denyAll();

  const schoolId = isValidSchoolId(selectedSchoolId) ? selectedSchoolId : null;

  let hasAdmin = false;
  let hasConsultor = false;
  let directsSelectedSchool = false;

  for (let index = 0; index < roles.length; index += 1) {
    const row: unknown = roles[index];
    if (!isAuthoritativeOwnRow(row, callerId)) continue;

    if (row.role_type === 'admin') {
      hasAdmin = true;
    } else if (row.role_type === 'consultor') {
      hasConsultor = true;
    } else if (
      row.role_type === 'equipo_directivo' &&
      schoolId !== null &&
      isValidSchoolId(row.school_id) &&
      row.school_id === schoolId
    ) {
      directsSelectedSchool = true;
    }
  }

  const hasSchool = schoolId !== null;
  const canWriteSchool = hasSchool && (hasAdmin || directsSelectedSchool);

  return {
    isAdmin: hasAdmin,
    canSelectSchool: hasAdmin || hasConsultor,
    canReadSchool: hasSchool && (hasAdmin || hasConsultor || directsSelectedSchool),
    canWriteSchool,
    canReadRestrictedContext: canWriteSchool,
  };
}
