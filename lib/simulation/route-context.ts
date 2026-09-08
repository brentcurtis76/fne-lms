import { isQaSimulationSchoolId } from './constants';

interface RouteRole {
  school_id?: string | number | null;
  is_active?: boolean | null;
  school?: { tenant_kind?: unknown } | null;
}

function parseSchoolId(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === 'number' && Number.isSafeInteger(candidate)) return candidate;
  if (typeof candidate !== 'string' || !/^\d+$/.test(candidate)) return null;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Browser display only. Classification still comes from server-returned school rows;
 * query parameters may select among those rows but can never invent a QA tenant.
 */
export function shouldShowQaSimulationBanner(input: {
  routeSchoolId?: unknown;
  profileSchoolId?: unknown;
  profileTenantKind?: unknown;
  roles?: RouteRole[] | null;
}): boolean {
  const activeRoles = (input.roles ?? []).filter((role) => role?.is_active !== false);
  const qaRoleSchoolIds = new Set(
    activeRoles
      .filter((role) => role?.school?.tenant_kind === 'qa')
      .map((role) => parseSchoolId(role.school_id))
      .filter((id): id is number => id !== null && isQaSimulationSchoolId(id))
  );

  const routeSchoolId = parseSchoolId(input.routeSchoolId);
  if (routeSchoolId !== null) return qaRoleSchoolIds.has(routeSchoolId);

  const profileSchoolId = parseSchoolId(input.profileSchoolId);
  if (
    input.profileTenantKind === 'qa' &&
    profileSchoolId !== null &&
    isQaSimulationSchoolId(profileSchoolId)
  ) {
    return true;
  }

  const allScopedSchoolIds = new Set(
    activeRoles
      .map((role) => parseSchoolId(role.school_id))
      .filter((id): id is number => id !== null)
  );
  return allScopedSchoolIds.size === 1 && qaRoleSchoolIds.size === 1;
}
