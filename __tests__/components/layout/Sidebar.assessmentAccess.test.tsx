// @vitest-environment jsdom
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

const roles: UserRoleType[] = [
  'docente', 'lider_comunidad', 'lider_generacion', 'equipo_directivo',
  'supervisor_de_red', 'encargado_licitacion', 'community_manager', 'consultor', 'admin',
];

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
    ? await screen.findByRole('button', { name: /Procesos de Cambio/ })
    : screen.queryByRole('button', { name: /Procesos de Cambio/ });
  if (button) fireEvent.click(button);
}

describe('Assigned assessments in the actual Sidebar', () => {
  it.each(roles)('shows the personal assessment link to an assigned %s', async role => {
    render(sidebar(role));
    await waitFor(() => expect(mocks.assignmentQuery).toHaveBeenCalledWith('user_id', 'synthetic-adult-a'));
    await openProcesses();
    expect(await screen.findByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
      .toHaveAttribute('href', '/docente/assessments');
    if (!['admin', 'consultor'].includes(role)) {
      expect(screen.queryByRole('link', { name: /Constructor de Evaluaciones/ })).not.toBeInTheDocument();
    }
  });

  it.each(roles)('hides the personal link from an unassigned %s', async role => {
    mocks.assignmentQuery.mockResolvedValue({ count: 0, error: null });
    render(sidebar(role));
    await act(async () => {});
    await openProcesses(false);
    expect(screen.queryByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
      .not.toBeInTheDocument();
  });

  it('shows the same link in the mobile menu for a community leader', async () => {
    render(sidebar('lider_comunidad', 'synthetic-adult-a', true));
    await act(async () => {});
    await openProcesses();
    expect(await screen.findByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
      .toHaveAttribute('href', '/docente/assessments');
  });

  it('hides the link on query errors even if a count is returned', async () => {
    mocks.assignmentQuery.mockResolvedValue({ count: 1, error: { message: 'Unavailable' } });
    render(sidebar('lider_comunidad'));
    await act(async () => {});
    await openProcesses(false);
    expect(screen.queryByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
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
    expect(screen.queryByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
      .not.toBeInTheDocument();
    await act(async () => { finishB({ count: 1, error: null }); });
    await openProcesses();
    expect(await screen.findByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
      .toBeInTheDocument();
    view.rerender(sidebar('lider_generacion', null));
    expect(screen.queryByRole('link', { name: /Mis Evaluaciones Evaluaciones que tengo asignadas/ }))
      .not.toBeInTheDocument();
  });
});
