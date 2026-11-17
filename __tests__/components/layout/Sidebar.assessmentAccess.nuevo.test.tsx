// @vitest-environment jsdom
/**
 * Redesign 5b: `Sidebar.assessmentAccess.test.tsx` run again with the look `nuevo` (the new
 * frame's menu). Every expectation about what is shown or hidden is the original's; the only lookup
 * that changed is the link's accessible name: today's menu prints a child's description inside the
 * link («Mis Registros Registros que tengo asignados»), the new one makes it the link's tooltip, so
 * the link is found by its label alone and its tooltip is checked instead.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '@/components/layout/Sidebar';
import type { UserRoleType } from '@/types/roles';

const mocks = vi.hoisted(() => {
  const assignmentQuery = vi.fn();
  const from = vi.fn((table: string) => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: string) => {
        if (table === 'assessment_instance_assignees') return assignmentQuery(column, value);
        return query;
      }),
      not: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return query;
  });
  return {
    assignmentQuery, supabase: { from },
    router: {
      asPath: '/dashboard', push: vi.fn(), prefetch: vi.fn(),
      events: { on: vi.fn(), off: vi.fn() },
    },
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
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'nuevo', setLook: () => {} }) }));
vi.mock('@/components/notifications/ModernNotificationCenter', () => ({ default: () => null }));
vi.mock('@/utils/navigationManager', () => ({ navigationManager: { prefetchRoute: vi.fn() } }));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));

const roles: UserRoleType[] = [
  'docente', 'lider_comunidad', 'lider_generacion', 'equipo_directivo',
  'supervisor_de_red', 'encargado_licitacion', 'community_manager', 'consultor', 'admin',
];

// Changed lookup: /Mis Registros Registros que tengo asignados/ → the label alone.
const MY_RECORDS = /^Mis Registros$/;

function sidebar(role: UserRoleType, id: string | null = 'synthetic-adult-a', mobile = false) {
  return <Sidebar user={id ? { id } as any : null} currentPage="dashboard"
    isDesktop={!mobile} isDesktopCollapsed={false} isMobileOpen={mobile}
    isAdmin={role === 'admin'} userRole={role} userRoles={[role]}
    onDesktopToggle={() => {}} onMobileClose={() => {}} onLogout={() => {}} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assignmentQuery.mockResolvedValue({ count: 1, error: null });
});

async function openProcesses(required = true) {
  const button = required
    ? await screen.findByRole('button', { name: /Gestor de Cambio/ })
    : screen.queryByRole('button', { name: /Gestor de Cambio/ });
  if (button) fireEvent.click(button);
}

describe('Assigned assessments in the actual Sidebar (look nuevo)', () => {
  it.each(roles)('shows the personal assessment link to an assigned %s', async role => {
    render(sidebar(role));
    await waitFor(() => expect(mocks.assignmentQuery).toHaveBeenCalledWith('user_id', 'synthetic-adult-a'));
    await openProcesses();
    const link = await screen.findByRole('link', { name: MY_RECORDS });
    expect(link).toHaveAttribute('href', '/docente/assessments');
    expect(link).toHaveAttribute('title', 'Registros que tengo asignados');
    if (!['admin', 'consultor'].includes(role)) {
      expect(screen.queryByRole('link', { name: /Constructor de Registros/ })).not.toBeInTheDocument();
    }
  });

  it.each(roles)('hides the personal link from an unassigned %s', async role => {
    mocks.assignmentQuery.mockResolvedValue({ count: 0, error: null });
    render(sidebar(role));
    await act(async () => {});
    await openProcesses(false);
    expect(screen.queryByRole('link', { name: MY_RECORDS }))
      .not.toBeInTheDocument();
  });

  it('shows the same link in the mobile menu for a community leader', async () => {
    render(sidebar('lider_comunidad', 'synthetic-adult-a', true));
    await act(async () => {});
    await openProcesses();
    expect(await screen.findByRole('link', { name: MY_RECORDS }))
      .toHaveAttribute('href', '/docente/assessments');
  });

  it('hides the link on query errors even if a count is returned', async () => {
    mocks.assignmentQuery.mockResolvedValue({ count: 1, error: { message: 'Unavailable' } });
    render(sidebar('lider_comunidad'));
    await act(async () => {});
    await openProcesses(false);
    expect(screen.queryByRole('link', { name: MY_RECORDS }))
      .not.toBeInTheDocument();
  });

  it('clears the old account state and ignores its late query after a session change', async () => {
    let finishA!: (value: any) => void;
    let finishB!: (value: any) => void;
    mocks.assignmentQuery.mockImplementation((_column, id) => new Promise(resolve => {
      if (id === 'synthetic-adult-a') finishA = resolve;
      else finishB = resolve;
    }));
    const view = render(sidebar('lider_comunidad'));
    view.rerender(sidebar('lider_generacion', 'synthetic-adult-b'));
    await act(async () => { finishA({ count: 1, error: null }); });
    expect(screen.queryByRole('link', { name: MY_RECORDS }))
      .not.toBeInTheDocument();
    await act(async () => { finishB({ count: 1, error: null }); });
    await openProcesses();
    expect(await screen.findByRole('link', { name: MY_RECORDS }))
      .toBeInTheDocument();
    view.rerender(sidebar('lider_generacion', null));
    expect(screen.queryByRole('link', { name: MY_RECORDS }))
      .not.toBeInTheDocument();
  });
});

describe('A first assignment during the session (20261008120000), look nuevo', () => {
  it('appears after the window regains focus, without logging in again', async () => {
    mocks.assignmentQuery.mockResolvedValue({ count: 0, error: null });
    render(sidebar('equipo_directivo'));
    await act(async () => {});
    await openProcesses(false); // opens the section if it is shown at all
    expect(screen.queryByRole('link', { name: MY_RECORDS })).not.toBeInTheDocument();

    mocks.assignmentQuery.mockResolvedValue({ count: 1, error: null });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    // the section stays open across the re-check; open it only if it was not shown before
    if (!screen.queryByRole('link', { name: MY_RECORDS })) {
      const button = screen.queryByRole('button', { name: /Gestor de Cambio/ });
      if (button && button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
    }
    expect(await screen.findByRole('link', { name: MY_RECORDS }))
      .toHaveAttribute('href', '/docente/assessments');
  });

  it('re-checks after each navigation and unsubscribes on unmount', async () => {
    const view = render(sidebar('equipo_directivo'));
    await act(async () => {});
    const [event, handler] = mocks.router.events.on.mock.calls.find(([e]: [string]) => e === 'routeChangeComplete')!;
    expect(event).toBe('routeChangeComplete');
    const before = mocks.assignmentQuery.mock.calls.length;
    await act(async () => { await handler(); });
    expect(mocks.assignmentQuery.mock.calls.length).toBe(before + 1);
    view.unmount();
    expect(mocks.router.events.off).toHaveBeenCalledWith('routeChangeComplete', handler);
  });

  it('an older answer arriving after a newer one never overwrites it (Codex B4 r1)', async () => {
    const resolvers: ((v: any) => void)[] = [];
    mocks.assignmentQuery.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    render(sidebar('equipo_directivo'));
    await act(async () => {});
    // initial check (#0) is pending; a focus starts a newer check (#1)
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(resolvers).toHaveLength(2);
    await act(async () => { resolvers[1]({ count: 1, error: null }); });
    await act(async () => { resolvers[0]({ count: 0, error: null }); });
    await openProcesses();
    expect(await screen.findByRole('link', { name: MY_RECORDS }))
      .toHaveAttribute('href', '/docente/assessments');
  });
});
