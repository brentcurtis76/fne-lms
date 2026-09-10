// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar, { NAVIGATION_ITEMS } from '@/components/layout/Sidebar';

const mocks = vi.hoisted(() => {
  const from = vi.fn(() => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      not: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return query;
  });
  return {
    supabase: { from },
    router: { asPath: '/dashboard', push: vi.fn(), prefetch: vi.fn() },
    permissions: {
      hasPermission: () => false, hasAnyPermission: () => false,
      hasAllPermissions: () => false, loading: false,
    },
  };
});

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => mocks.supabase, useUser: () => null,
}));
vi.mock('@/contexts/PermissionContext', () => ({ usePermissions: () => mocks.permissions }));
vi.mock('@/components/notifications/ModernNotificationCenter', () => ({ default: () => null }));
vi.mock('@/utils/navigationManager', () => ({ navigationManager: { prefetchRoute: vi.fn() } }));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));

const RESULTS_HREF = '/directivo/assessments/dashboard';
const RESULTS_LINK = /^Panel de Resultados/;
const CONTEXT_LINK = /^Contexto Transversal/;

interface Actor { roles: string[]; isAdmin?: boolean; mobile?: boolean }

function sidebar({ roles, isAdmin = false, mobile = false }: Actor) {
  return <Sidebar user={{ id: 'synthetic-adult-a' } as any} currentPage="dashboard"
    isDesktop={!mobile} isDesktopCollapsed={false} isMobileOpen={mobile}
    isAdmin={isAdmin} userRole={roles[0] ?? ''} userRoles={roles}
    onDesktopToggle={() => {}} onMobileClose={() => {}} onLogout={() => {}} />;
}

// Expands every rendered group so no link is hidden behind a collapsed parent.
async function renderExpanded(actor: Actor) {
  render(sidebar(actor));
  await act(async () => {});
  for (const button of screen.queryAllByTestId(/^sidebar-item-/)) fireEvent.click(button);
}

const resultsLinks = () => screen.queryAllByRole('link', { name: RESULTS_LINK });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Panel de Resultados in the actual Sidebar', () => {
  it.each([false, true])('shows equipo_directivo exactly one results link under Reportes (mobile=%s)', async mobile => {
    await renderExpanded({ roles: ['equipo_directivo'], mobile });
    const links = resultsLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', RESULTS_HREF);
    const group = screen.getByTestId('sidebar-item-reportes').parentElement!;
    expect(group).toContainElement(links[0]);
    links[0].focus();
    expect(links[0]).toHaveFocus();
  });

  it('keeps Vías de Transformación and its admin-only siblings hidden from equipo_directivo', async () => {
    await renderExpanded({ roles: ['equipo_directivo'] });
    expect(screen.queryByTestId('sidebar-item-vias-transformacion')).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/admin/transformation/assessments"]')).toBeNull();
    expect(document.querySelector('a[href="/vias-transformacion"]')).toBeNull();
    expect(screen.getAllByRole('link', { name: CONTEXT_LINK })).toHaveLength(1);
  });

  it.each<[string, Actor]>([
    ['admin', { roles: ['admin'], isAdmin: true }],
    ['admin + equipo_directivo', { roles: ['admin', 'equipo_directivo'], isAdmin: true }],
    ['docente with secondary equipo_directivo', { roles: ['docente', 'equipo_directivo'] }],
    ['equipo_directivo + consultor', { roles: ['equipo_directivo', 'consultor'] }],
  ])('shows %s exactly one results link', async (_label, actor) => {
    await renderExpanded(actor);
    const links = resultsLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', RESULTS_HREF);
  });

  it('preserves the remaining Vías de Transformación children for admin', async () => {
    await renderExpanded({ roles: ['admin'], isAdmin: true });
    const vias = screen.getByTestId('sidebar-item-vias-transformacion').parentElement!;
    expect(vias.querySelector('a[href="/vias-transformacion"]')).not.toBeNull();
    expect(vias.querySelector('a[href="/school/transversal-context"]')).not.toBeNull();
    expect(vias.querySelector('a[href="/admin/transformation/assessments"]')).not.toBeNull();
  });

  it.each([
    ['docente'], ['consultor'], ['lider_comunidad'], ['lider_generacion'],
    ['supervisor_de_red'], ['community_manager'], ['encargado_licitacion'],
  ])('hides the results link from %s', async role => {
    await renderExpanded({ roles: [role] });
    expect(resultsLinks()).toHaveLength(0);
  });

  it('hides the results link when no active role is present', async () => {
    await renderExpanded({ roles: [] });
    expect(resultsLinks()).toHaveLength(0);
  });

  // Negative control: the same assertion against the pre-change placement
  // (ungated child of the adminOnly Vías group) must find no link for directivo.
  it('control: the pre-change placement gives equipo_directivo no results link', async () => {
    const reportes = NAVIGATION_ITEMS.find(item => item.id === 'reportes')!;
    const vias = NAVIGATION_ITEMS.find(item => item.id === 'vias-transformacion')!;
    const index = reportes.children!.findIndex(child => child.href === RESULTS_HREF);
    expect(index).toBeGreaterThanOrEqual(0);
    const [moved] = reportes.children!.splice(index, 1);
    const { restrictedRoles: _gate, ...ungated } = moved;
    vias.children!.splice(2, 0, ungated);
    try {
      await renderExpanded({ roles: ['equipo_directivo'] });
      expect(resultsLinks()).toHaveLength(0);
    } finally {
      vias.children!.splice(2, 1);
      reportes.children!.splice(index, 0, moved);
    }
  });
});
