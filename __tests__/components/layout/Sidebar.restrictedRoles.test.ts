// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

// Mirrors the parent-item restrictedRoles predicate used in
// `components/layout/Sidebar.tsx` (filteredNavigationItems). The Sidebar
// change must keep that predicate equivalent, so we re-implement it inline
// here rather than exporting a helper from production code. The multi-role
// variant consults `ctx.userRoles` (the full set of the user's active role
// types) so any matching role unlocks visibility. When `userRoles` is
// omitted, it falls back to `[ctx.userRole]` for backward compatibility.
function isItemVisible(
  item: { restrictedRoles?: string[] },
  ctx: { userRole?: string; userRoles?: string[]; isAdmin: boolean }
): boolean {
  if (!item.restrictedRoles || item.restrictedRoles.length === 0) return true;
  const roles =
    ctx.userRoles && ctx.userRoles.length > 0
      ? ctx.userRoles
      : ctx.userRole
        ? [ctx.userRole]
        : [];
  return (
    roles.some(role => item.restrictedRoles!.includes(role)) ||
    (ctx.isAdmin && item.restrictedRoles.includes('admin'))
  );
}

const growthCommunitiesItem = {
  id: 'growth-communities',
  restrictedRoles: ['admin', 'equipo_directivo'],
};

describe('Sidebar growth-communities restrictedRoles gating', () => {
  it('shows the item to admin (via isAdmin flag)', () => {
    expect(isItemVisible(growthCommunitiesItem, { userRoles: ['admin'], isAdmin: true })).toBe(true);
  });

  it('shows the item to equipo_directivo', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRoles: ['equipo_directivo'], isAdmin: false })
    ).toBe(true);
  });

  it('hides the item from consultor', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRoles: ['consultor'], isAdmin: false })
    ).toBe(false);
  });

  it('hides the item from docente', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRoles: ['docente'], isAdmin: false })
    ).toBe(false);
  });

  it('hides the item when role list is empty', () => {
    expect(isItemVisible(growthCommunitiesItem, { userRoles: [], isAdmin: false })).toBe(false);
    expect(isItemVisible(growthCommunitiesItem, { isAdmin: false })).toBe(false);
  });

  it('shows the item to a multi-role user when a secondary role unlocks it (equipo_directivo + docente)', () => {
    expect(
      isItemVisible(growthCommunitiesItem, {
        userRoles: ['equipo_directivo', 'docente'],
        isAdmin: false,
      })
    ).toBe(true);
  });

  it('falls back to the legacy userRole prop when userRoles is omitted', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRole: 'equipo_directivo', isAdmin: false })
    ).toBe(true);
    expect(
      isItemVisible(growthCommunitiesItem, { userRole: 'docente', isAdmin: false })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PR #88 supersedes PR 3's teaching-role restriction: personal assignments,
// not the role name, determine whether Mis Evaluaciones is available.
// The full Sidebar behavior is covered by Sidebar.assessmentAccess.test.tsx.
// ---------------------------------------------------------------------------
import { NAVIGATION_ITEMS } from '../../../components/layout/Sidebar';

function findChild(id: string) {
  for (const item of NAVIGATION_ITEMS) {
    const child = (item.children || []).find(c => c.id === id);
    if (child) return child;
  }
  return undefined;
}

describe("Sidebar 'Mis Evaluaciones' restrictedRoles (real navigation config)", () => {
  const item = findChild('docente-mis-evaluaciones');

  it('exists under the assessment section and still requires assigned assessments', () => {
    expect(item).toBeDefined();
    expect(item!.href).toBe('/docente/assessments');
    expect(item!.requiresAssessments).toBe(true);
  });

  it('does not exclude assigned participants by role', () => {
    expect(item!.restrictedRoles).toBeUndefined();
  });

  it('passes the role predicate for all nine roles; assignment checks remain mandatory', () => {
    for (const role of ['docente', 'admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'community_manager', 'encargado_licitacion']) {
      expect(isItemVisible(item!, { userRoles: [role], isAdmin: role === 'admin' })).toBe(true);
    }
    expect(item!.requiresAssessments).toBe(true);
  });
});
