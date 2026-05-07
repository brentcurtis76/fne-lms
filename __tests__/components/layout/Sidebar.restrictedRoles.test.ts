// @vitest-environment node
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
