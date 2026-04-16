import type { SessionAccessContext } from '../../lib/utils/session-policy';
import type { UserRole } from '../../types/roles';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const SCHOOL_ID = 1;
export const GC_ID = 'gc-uuid-1111';

export function buildContext(overrides?: Partial<SessionAccessContext>): SessionAccessContext {
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

export function buildUserRole(overrides?: Partial<Record<string, unknown>>): UserRole {
  return {
    id: 'role-uuid-1111',
    user_id: USER_ID,
    role_type: 'consultor',
    school_id: SCHOOL_ID,
    community_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as UserRole;
}
