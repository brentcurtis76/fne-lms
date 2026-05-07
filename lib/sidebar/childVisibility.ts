export interface ChildVisibilityContext {
  isAdmin: boolean;
  /**
   * Legacy primary-role field. Kept for backward compatibility with callers
   * that have not migrated to `userRoles`. When `userRoles` is omitted, the
   * predicate falls back to evaluating `[userRole]`.
   */
  userRole?: string;
  /**
   * Full set of the user's active role types. When provided, role-based gates
   * (`consultantOnly`, `restrictedRoles`, `requiresCommunity` consultor
   * exception, consultor permission bypass) admit the child if ANY of the
   * user's roles satisfies the gate.
   */
  userRoles?: string[];
  isSuperadmin: boolean;
  superadminCheckDone: boolean;
  hasCommunity: boolean;
  communityCheckDone: boolean;
  canRunQATests: boolean;
  qaCheckDone: boolean;
  hasAssessments: boolean;
  assessmentsCheckDone: boolean;
  featureSuperadminRbac: boolean;
  permissionsLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

export interface NavigationChildLike {
  adminOnly?: boolean;
  consultantOnly?: boolean;
  superadminOnly?: boolean;
  restrictedRoles?: string[];
  permission?: string | string[];
  requireAllPermissions?: boolean;
  requiresCommunity?: boolean;
  requiresQAAccess?: boolean;
  requiresAssessments?: boolean;
}

function resolveRoles(ctx: ChildVisibilityContext): string[] {
  if (ctx.userRoles && ctx.userRoles.length > 0) return ctx.userRoles;
  return ctx.userRole ? [ctx.userRole] : [];
}

export function isChildVisible(child: NavigationChildLike, ctx: ChildVisibilityContext): boolean {
  const roles = resolveRoles(ctx);
  if (child.superadminOnly) {
    if (!ctx.featureSuperadminRbac) return false;
    if (!ctx.superadminCheckDone) return false;
    if (!ctx.isSuperadmin) return false;
  }
  if (child.requiresQAAccess) {
    if (!ctx.qaCheckDone) return false;
    if (!ctx.canRunQATests && !ctx.isAdmin) return false;
  }
  if (child.requiresAssessments) {
    if (!ctx.assessmentsCheckDone) return false;
    if (!ctx.hasAssessments) return false;
  }
  if (child.requiresCommunity) {
    if (!ctx.communityCheckDone) return false;
    if (!ctx.hasCommunity && !roles.includes('consultor')) return false;
  }
  if (child.adminOnly && !ctx.isAdmin) {
    return false;
  }
  if (
    child.consultantOnly &&
    !ctx.isAdmin &&
    !roles.some(role => role === 'admin' || role === 'consultor')
  ) {
    return false;
  }
  // Short-circuits: when both restrictedRoles and permission are set, restrictedRoles wins and permission is intentionally not composed — matches the parent filter in Sidebar.tsx for backward compatibility.
  if (child.restrictedRoles && child.restrictedRoles.length > 0) {
    return (
      roles.some(role => child.restrictedRoles!.includes(role)) ||
      (ctx.isAdmin && child.restrictedRoles.includes('admin'))
    );
  }
  if (child.permission && !ctx.isAdmin) {
    // consultorBypassesPermission: a consultantOnly child grants access to
    // consultors even when they lack the listed permission, because
    // consultantOnly is treated as an explicit role grant that supersedes the
    // permission gate (admins also bypass). Multi-role users still bypass as
    // long as `consultor` is one of their active roles.
    const consultorBypassesPermission = child.consultantOnly && roles.includes('consultor');
    if (!consultorBypassesPermission) {
      if (ctx.permissionsLoading) return false;
      if (Array.isArray(child.permission)) {
        if (child.requireAllPermissions) {
          return ctx.hasAllPermissions(child.permission);
        } else {
          return ctx.hasAnyPermission(child.permission);
        }
      } else {
        return ctx.hasPermission(child.permission);
      }
    }
  }
  return true;
}
