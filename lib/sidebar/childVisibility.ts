export interface ChildVisibilityContext {
  isAdmin: boolean;
  userRole?: string;
  isSuperadmin: boolean;
  superadminCheckDone: boolean;
  hasCommunity: boolean;
  communityCheckDone: boolean;
  canRunQATests: boolean;
  qaCheckDone: boolean;
  hasAssessments: boolean;
  assessmentsCheckDone: boolean;
  featureSuperadminRbac: boolean;
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

export function isChildVisible(child: NavigationChildLike, ctx: ChildVisibilityContext): boolean {
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
    if (!ctx.hasCommunity && ctx.userRole !== 'consultor') return false;
  }
  if (child.adminOnly && !ctx.isAdmin) {
    return false;
  }
  if (child.consultantOnly && !ctx.isAdmin && !['admin', 'consultor'].includes(ctx.userRole || '')) {
    return false;
  }
  if (child.restrictedRoles && child.restrictedRoles.length > 0) {
    return child.restrictedRoles.includes(ctx.userRole || '') || (ctx.isAdmin && child.restrictedRoles.includes('admin'));
  }
  if (child.permission && !ctx.isAdmin) {
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
  return true;
}
