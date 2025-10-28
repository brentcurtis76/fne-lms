/**
 * Utility function to extract user roles from Supabase session
 * Handles both singular 'role' and plural 'roles' fields for backwards compatibility
 *
 * @param session - Supabase session object
 * @returns Array of role strings
 */
export function getUserRoles(session: { user: { user_metadata?: any } } | null): string[] {
  if (!session?.user?.user_metadata) {
    return [];
  }

  const metadata = session.user.user_metadata;

  // Check for roles (plural array) first
  const rolesArray = metadata.roles;
  if (Array.isArray(rolesArray)) {
    return rolesArray;
  }

  // If roles is a single string, wrap it in an array
  if (rolesArray && typeof rolesArray === 'string') {
    return [rolesArray];
  }

  // Fall back to role (singular)
  const singleRole = metadata.role;
  if (singleRole && typeof singleRole === 'string') {
    return [singleRole];
  }

  return [];
}

/**
 * Check if user has a specific role
 */
export function hasRole(session: { user: { user_metadata?: any } } | null, role: string): boolean {
  const roles = getUserRoles(session);
  return roles.includes(role);
}

/**
 * Check if user is an admin
 */
export function isAdmin(session: { user: { user_metadata?: any } } | null): boolean {
  return hasRole(session, 'admin');
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(session: { user: { user_metadata?: any } } | null, rolesToCheck: string[]): boolean {
  const userRoles = getUserRoles(session);
  return rolesToCheck.some(role => userRoles.includes(role));
}
