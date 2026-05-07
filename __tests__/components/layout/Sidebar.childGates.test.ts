// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  isChildVisible,
  type ChildVisibilityContext,
} from '../../../lib/sidebar/childVisibility';

// Gates covered: superadminOnly, requiresQAAccess, requiresAssessments,
// requiresCommunity. Parent semantics are mirrored exactly:
//  - superadminOnly additionally requires the FEATURE_SUPERADMIN_RBAC flag
//    and `superadminCheckDone` before honoring `isSuperadmin`.
//  - requiresQAAccess waits for `qaCheckDone`, then admits if `canRunQATests`
//    OR `isAdmin` (admin override).
//  - requiresAssessments waits for `assessmentsCheckDone`, then admits if
//    `hasAssessments`.
//  - requiresCommunity waits for `communityCheckDone`, then admits if
//    `hasCommunity` OR the user's role is `consultor` (consultor exception).

const baseCtx: ChildVisibilityContext = {
  userRole: '',
  isAdmin: false,
  isSuperadmin: false,
  superadminCheckDone: true,
  hasCommunity: false,
  communityCheckDone: true,
  canRunQATests: false,
  qaCheckDone: true,
  hasAssessments: false,
  assessmentsCheckDone: true,
  featureSuperadminRbac: true,
  permissionsLoading: false,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  hasAllPermissions: () => false,
};

describe('Sidebar child gating: superadminOnly', () => {
  const child = { superadminOnly: true };

  it('shows the child to an active superadmin when the feature flag is on and the check is done', () => {
    expect(
      isChildVisible(child, { ...baseCtx, isSuperadmin: true, superadminCheckDone: true })
    ).toBe(true);
  });

  it('hides the child when FEATURE_SUPERADMIN_RBAC is disabled, even for a superadmin', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        featureSuperadminRbac: false,
        isSuperadmin: true,
        superadminCheckDone: true,
      })
    ).toBe(false);
  });

  it('hides the child while the superadmin check is still pending', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        isSuperadmin: true,
        superadminCheckDone: false,
      })
    ).toBe(false);
  });

  it('hides the child from non-superadmins (including admins)', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'admin',
        isAdmin: true,
        isSuperadmin: false,
        superadminCheckDone: true,
      })
    ).toBe(false);
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        isSuperadmin: false,
        superadminCheckDone: true,
      })
    ).toBe(false);
  });
});

describe('Sidebar child gating: requiresQAAccess', () => {
  const child = { requiresQAAccess: true };

  it('shows the child to users with can_run_qa_tests', () => {
    expect(
      isChildVisible(child, { ...baseCtx, canRunQATests: true, qaCheckDone: true })
    ).toBe(true);
  });

  it('shows the child to admins even without can_run_qa_tests (admin override)', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'admin',
        isAdmin: true,
        canRunQATests: false,
        qaCheckDone: true,
      })
    ).toBe(true);
  });

  it('hides the child while the QA check is still pending', () => {
    expect(
      isChildVisible(child, { ...baseCtx, canRunQATests: true, qaCheckDone: false })
    ).toBe(false);
  });

  it('hides the child from non-admins without can_run_qa_tests', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        canRunQATests: false,
        qaCheckDone: true,
      })
    ).toBe(false);
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        canRunQATests: false,
        qaCheckDone: true,
      })
    ).toBe(false);
  });
});

describe('Sidebar child gating: requiresAssessments', () => {
  const child = { requiresAssessments: true };

  it('shows the child to a user with assigned assessments', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        hasAssessments: true,
        assessmentsCheckDone: true,
      })
    ).toBe(true);
  });

  it('hides the child while the assessments check is still pending', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        hasAssessments: true,
        assessmentsCheckDone: false,
      })
    ).toBe(false);
  });

  it('hides the child when the user has no assigned assessments', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        hasAssessments: false,
        assessmentsCheckDone: true,
      })
    ).toBe(false);
  });

  it('hides the child from admins when they have no assigned assessments (no admin override)', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'admin',
        isAdmin: true,
        hasAssessments: false,
        assessmentsCheckDone: true,
      })
    ).toBe(false);
  });
});

describe('Sidebar child gating: requiresCommunity', () => {
  const child = { requiresCommunity: true };

  it('shows the child to a user with a community membership', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        hasCommunity: true,
        communityCheckDone: true,
      })
    ).toBe(true);
  });

  it('shows the child to a consultor even without a community (consultor exception)', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        hasCommunity: false,
        communityCheckDone: true,
      })
    ).toBe(true);
  });

  it('hides the child while the community check is still pending', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        hasCommunity: true,
        communityCheckDone: false,
      })
    ).toBe(false);
  });

  it('hides the child from non-consultor users without a community', () => {
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        hasCommunity: false,
        communityCheckDone: true,
      })
    ).toBe(false);
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'equipo_directivo',
        hasCommunity: false,
        communityCheckDone: true,
      })
    ).toBe(false);
  });
});

describe('Sidebar child gating: permissionsLoading + consultor bypass', () => {
  it('hides a permission-gated child while permissionsLoading=true for a non-admin, non-consultor user, even if hasPermission stubs to true', () => {
    const child = { permission: 'view_contracts_all' };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'docente',
        isAdmin: false,
        permissionsLoading: true,
        hasPermission: () => true,
        hasAnyPermission: () => true,
        hasAllPermissions: () => true,
      })
    ).toBe(false);
  });

  it('shows a permission-gated child to admins even when permissionsLoading=true (admin bypasses permission gate)', () => {
    const child = { permission: 'view_contracts_all' };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'admin',
        isAdmin: true,
        permissionsLoading: true,
        hasPermission: () => false,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
      })
    ).toBe(true);
  });

  it('shows a consultantOnly + permission child to consultor regardless of hasPermission (consultor bypass)', () => {
    const child = { consultantOnly: true, permission: 'assign_consultants_all' };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        isAdmin: false,
        permissionsLoading: false,
        hasPermission: () => false,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
      })
    ).toBe(true);
    // Bypass also holds while permissions are still loading.
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        isAdmin: false,
        permissionsLoading: true,
        hasPermission: () => false,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
      })
    ).toBe(true);
  });

  it('still filters a permission-only child (no consultantOnly) by hasPermission for consultor', () => {
    const child = { permission: 'manage_system_settings' };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        isAdmin: false,
        permissionsLoading: false,
        hasPermission: () => false,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
      })
    ).toBe(false);
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRole: 'consultor',
        isAdmin: false,
        permissionsLoading: false,
        hasPermission: (p) => p === 'manage_system_settings',
        hasAnyPermission: () => true,
        hasAllPermissions: () => true,
      })
    ).toBe(true);
  });
});

describe('Sidebar child gating: no gates', () => {
  it('shows children with no gating flags regardless of context', () => {
    expect(isChildVisible({}, baseCtx)).toBe(true);
    expect(
      isChildVisible(
        {},
        {
          ...baseCtx,
          userRole: 'docente',
          superadminCheckDone: false,
          qaCheckDone: false,
          assessmentsCheckDone: false,
          communityCheckDone: false,
        }
      )
    ).toBe(true);
  });
});

describe('Sidebar child gating: multi-role users (userRoles)', () => {
  it('shows a restrictedRoles child when a secondary active role unlocks it (equipo_directivo + encargado_licitacion against [admin, encargado_licitacion])', () => {
    const child = { restrictedRoles: ['admin', 'encargado_licitacion'] };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRoles: ['equipo_directivo', 'encargado_licitacion'],
        isAdmin: false,
      })
    ).toBe(true);
  });

  it('shows a consultantOnly child when consultor is one of multiple active roles', () => {
    const child = { consultantOnly: true };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRoles: ['equipo_directivo', 'consultor'],
        isAdmin: false,
      })
    ).toBe(true);
  });

  it('applies the consultor permission bypass for consultantOnly + permission children when userRoles contains consultor regardless of other roles', () => {
    const child = { consultantOnly: true, permission: 'assign_consultants_all' };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRoles: ['equipo_directivo', 'consultor'],
        isAdmin: false,
        permissionsLoading: false,
        hasPermission: () => false,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
      })
    ).toBe(true);
    // Bypass also holds while permissions are still loading.
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRoles: ['docente', 'consultor', 'lider_comunidad'],
        isAdmin: false,
        permissionsLoading: true,
        hasPermission: () => false,
        hasAnyPermission: () => false,
        hasAllPermissions: () => false,
      })
    ).toBe(true);
  });

  it('hides a restrictedRoles: [admin] child from a multi-role user with no admin role (equipo_directivo + encargado_licitacion)', () => {
    const child = { restrictedRoles: ['admin'] };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRoles: ['equipo_directivo', 'encargado_licitacion'],
        isAdmin: false,
      })
    ).toBe(false);
  });

  it('admits requiresCommunity for a multi-role consultor without a community (consultor exception holds in userRoles list)', () => {
    const child = { requiresCommunity: true };
    expect(
      isChildVisible(child, {
        ...baseCtx,
        userRoles: ['consultor', 'equipo_directivo'],
        hasCommunity: false,
        communityCheckDone: true,
      })
    ).toBe(true);
  });

  it('falls back to the legacy userRole prop when userRoles is omitted (backward compatibility)', () => {
    // restrictedRoles: a single legacy role still gates correctly.
    expect(
      isChildVisible(
        { restrictedRoles: ['encargado_licitacion'] },
        { ...baseCtx, userRole: 'encargado_licitacion' }
      )
    ).toBe(true);
    expect(
      isChildVisible(
        { restrictedRoles: ['encargado_licitacion'] },
        { ...baseCtx, userRole: 'equipo_directivo' }
      )
    ).toBe(false);
    // consultor permission bypass: works via legacy userRole alone.
    expect(
      isChildVisible(
        { consultantOnly: true, permission: 'assign_consultants_all' },
        {
          ...baseCtx,
          userRole: 'consultor',
          hasPermission: () => false,
          hasAnyPermission: () => false,
          hasAllPermissions: () => false,
        }
      )
    ).toBe(true);
  });
});
