// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Mirrors the parent-item restrictedRoles predicate used in
// `components/layout/Sidebar.tsx` (filteredNavigationItems). The Sidebar
// change must keep that predicate untouched, so we re-implement it inline
// here rather than exporting a helper from production code.
function isItemVisible(
  item: { restrictedRoles?: string[] },
  ctx: { userRole?: string; isAdmin: boolean }
): boolean {
  if (!item.restrictedRoles || item.restrictedRoles.length === 0) return true;
  return (
    item.restrictedRoles.includes(ctx.userRole || '') ||
    (ctx.isAdmin && item.restrictedRoles.includes('admin'))
  );
}

const growthCommunitiesItem = {
  id: 'growth-communities',
  restrictedRoles: ['admin', 'equipo_directivo'],
};

describe('Sidebar growth-communities restrictedRoles gating', () => {
  it('shows the item to admin (via isAdmin flag)', () => {
    expect(isItemVisible(growthCommunitiesItem, { userRole: 'admin', isAdmin: true })).toBe(true);
  });

  it('shows the item to equipo_directivo', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRole: 'equipo_directivo', isAdmin: false })
    ).toBe(true);
  });

  it('hides the item from consultor', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRole: 'consultor', isAdmin: false })
    ).toBe(false);
  });

  it('hides the item from docente', () => {
    expect(
      isItemVisible(growthCommunitiesItem, { userRole: 'docente', isAdmin: false })
    ).toBe(false);
  });

  it('hides the item when role is empty', () => {
    expect(isItemVisible(growthCommunitiesItem, { userRole: '', isAdmin: false })).toBe(false);
    expect(isItemVisible(growthCommunitiesItem, { isAdmin: false })).toBe(false);
  });
});
