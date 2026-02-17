/**
 * Session Access Policy Helpers
 *
 * Centralized policy functions for determining read and write access to sessions.
 * All functions are pure — they accept pre-fetched data and return boolean decisions.
 *
 * This enables consistent enforcement across all session APIs and eliminates policy drift.
 */

import { UserRole } from '../../types/roles';

/**
 * Consultor access metadata: indicates global scope and session school IDs they can access.
 */
export interface ConsultorAccess {
  isGlobal: boolean;
  schoolIds: (string | number)[];
}

/**
 * Determine consultor access level based on their roles.
 * If they have ANY active consultor role with school_id IS NULL, they are global.
 * Otherwise, returns the specific schools they can access.
 */
export function getConsultorAccess(userRoles: UserRole[]): ConsultorAccess {
  const consultorRoles = userRoles.filter(
    (r) => r.role_type === 'consultor' && r.is_active
  );

  // Check if any consultor role is global (school_id IS NULL)
  const isGlobal = consultorRoles.some((r) => !r.school_id);

  if (isGlobal) {
    return { isGlobal: true, schoolIds: [] };
  }

  // Otherwise, collect specific school IDs
  const schoolIds = consultorRoles
    .filter((r) => r.school_id)
    .map((r) => String(r.school_id));

  return { isGlobal: false, schoolIds };
}

/**
 * Context object passed to policy decision functions.
 * Contains all necessary information to make access decisions.
 */
export interface SessionAccessContext {
  /**
   * The role type of the user (admin, consultor, lider_comunidad, etc.)
   */
  highestRole: string;

  /**
   * All roles assigned to the user (for detailed access checks)
   */
  userRoles: UserRole[];

  /**
   * Session details needed for access decisions
   */
  session: {
    id?: string;
    school_id: number;
    growth_community_id: string;
    status: string;
  };

  /**
   * The user ID making the request
   */
  userId: string;

  /**
   * Whether the user is an assigned facilitator for this session
   * Pre-fetched by the caller to keep the helper pure
   */
  isFacilitator: boolean;
}

/**
 * Determine if a user can view a session.
 *
 * Returns true if user is:
 * - Admin (full access)
 * - Consultor at the same school as the session, OR global consultor (school_id IS NULL)
 * - Growth community member for this session's community
 *
 * This follows the "see all but edit only own" product model.
 */
export function canViewSession(ctx: SessionAccessContext): boolean {
  // Admins can view all sessions
  if (ctx.highestRole === 'admin') {
    return true;
  }

  // Consultors can view sessions at their assigned schools or if they are global
  if (ctx.highestRole === 'consultor') {
    const access = getConsultorAccess(ctx.userRoles);

    // Global consultors can view all sessions
    if (access.isGlobal) {
      return true;
    }

    // School-specific consultors can view sessions at their schools
    if (access.schoolIds.includes(String(ctx.session.school_id))) {
      return true;
    }
  }

  // Growth community members can view their community's sessions
  const gcMemberships = ctx.userRoles.filter(
    (r) => r.community_id === ctx.session.growth_community_id && r.is_active
  );

  if (gcMemberships.length > 0) {
    return true;
  }

  return false;
}

/**
 * Determine if a user can edit a session (contribute materials, update attendees, etc.).
 *
 * Returns true if user is:
 * - Admin
 * - An assigned facilitator for this session
 * - Growth community leader for this session's community (can edit content)
 *
 * Non-assigned consultors who can view remain read-only.
 */
export function canEditSession(ctx: SessionAccessContext): boolean {
  // Admins can edit all sessions
  if (ctx.highestRole === 'admin') {
    return true;
  }

  // Assigned facilitators can edit
  if (ctx.isFacilitator) {
    return true;
  }

  // Growth community leaders can edit
  const isGcLeader = ctx.userRoles.some(
    (r) => r.role_type === 'lider_comunidad' && r.community_id === ctx.session.growth_community_id && r.is_active
  );

  if (isGcLeader) {
    return true;
  }

  return false;
}

/**
 * Determine if a user can contribute to a session (write operations).
 *
 * This combines edit permission with session status check.
 * Returns true only if user can edit AND session is in a writable state.
 *
 * Writable states: anything except 'completada' or 'cancelada'
 */
export function canContributeToSession(ctx: SessionAccessContext): boolean {
  // Check if session is in a writable state
  if (ctx.session.status === 'completada' || ctx.session.status === 'cancelada') {
    return false;
  }

  // User must be able to edit the session
  return canEditSession(ctx);
}
