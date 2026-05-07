// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Mirrors the child-item gate predicates used in
// `components/layout/Sidebar.tsx` (filteredChildren). The Sidebar change
// must keep that predicate untouched, so we re-implement it inline here
// rather than exporting a helper from production code.
//
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

interface ChildItem {
  superadminOnly?: boolean;
  requiresQAAccess?: boolean;
  requiresAssessments?: boolean;
  requiresCommunity?: boolean;
}

interface ChildContext {
  userRole?: string;
  isAdmin: boolean;
  isSuperadmin: boolean;
  superadminCheckDone: boolean;
  hasCommunity: boolean;
  communityCheckDone: boolean;
  canRunQATests: boolean;
  qaCheckDone: boolean;
  hasAssessments: boolean;
  assessmentsCheckDone: boolean;
  featureSuperadminRbac: boolean;
}

function isChildVisible(child: ChildItem, ctx: ChildContext): boolean {
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
  return true;
}

const baseCtx: ChildContext = {
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
