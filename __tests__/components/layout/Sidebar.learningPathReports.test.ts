// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/router', () => ({ useRouter: () => ({ asPath: '/', pathname: '/', query: {}, push: vi.fn() }) }));

import { NAVIGATION_ITEMS } from '../../../components/layout/Sidebar';
import { isChildVisible, type ChildVisibilityContext } from '../../../lib/sidebar/childVisibility';

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

const item = NAVIGATION_ITEMS.find((i) => i.id === 'reportes')?.children?.find((c) => c.id === 'learning-path-reports');

describe('Reportes > Rutas de Aprendizaje menu item', () => {
  it('exists and opens the learning-path tab of /reports', () => {
    expect(item).toBeDefined();
    expect(item!.href).toBe('/reports?tab=learning-paths');
  });

  it('is shown to admin, consultor and equipo_directivo', () => {
    expect(isChildVisible(item!, { ...baseCtx, userRoles: ['admin'], isAdmin: true })).toBe(true);
    expect(isChildVisible(item!, { ...baseCtx, userRoles: ['consultor'] })).toBe(true);
    expect(isChildVisible(item!, { ...baseCtx, userRoles: ['equipo_directivo'] })).toBe(true);
  });

  it('is hidden from every other role', () => {
    for (const role of ['docente', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'community_manager', 'encargado_licitacion']) {
      expect(isChildVisible(item!, { ...baseCtx, userRoles: [role] })).toBe(false);
    }
    expect(isChildVisible(item!, { ...baseCtx, userRoles: [] })).toBe(false);
  });
});
