// @vitest-environment jsdom
/**
 * "Mi pasantía" in the ACTUAL Sidebar: shown only to an account whose email a
 * school registered as a January 2027 traveller (`GET /api/pasantias/mine`),
 * whatever its role — and never on a failed or late answer.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '@/components/layout/Sidebar';
import type { UserRoleType } from '@/types/roles';

const mocks = vi.hoisted(() => {
  const from = vi.fn(() => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => Promise.resolve({ count: 0, error: null, data: [] })),
      not: vi.fn(() => query),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return query;
  });
  return {
    supabase: { from },
    router: { asPath: '/dashboard', push: vi.fn(), prefetch: vi.fn(), events: { on: vi.fn(), off: vi.fn() } },
    permissions: { hasPermission: () => false, hasAnyPermission: () => false, hasAllPermissions: () => false, loading: false },
  };
});

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => mocks.supabase, useUser: () => null }));
vi.mock('@/contexts/PermissionContext', () => ({ usePermissions: () => mocks.permissions }));
vi.mock('@/components/notifications/ModernNotificationCenter', () => ({ default: () => null }));
vi.mock('@/utils/navigationManager', () => ({ navigationManager: { prefetchRoute: vi.fn() } }));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));

const fetchMock = vi.fn();
const ITEM = 'sidebar-item-mi-pasantia';

function sidebar(role: UserRoleType, id: string | null = 'synthetic-adult-a') {
  return <Sidebar user={id ? ({ id } as any) : null} currentPage="dashboard"
    isDesktop isDesktopCollapsed={false} isMobileOpen={false}
    isAdmin={role === 'admin'} userRole={role} userRoles={[role]}
    onDesktopToggle={() => {}} onMobileClose={() => {}} onLogout={() => {}} />;
}

const answer = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('Mi pasantía in the actual Sidebar', () => {
  it.each(['docente', 'equipo_directivo', 'consultor', 'admin'] as UserRoleType[])(
    'shows the link to a %s whose email is a traveller\'s',
    async (role) => {
      fetchMock.mockImplementation(() => answer({ hasPasantia: true }));
      render(sidebar(role));
      const item = await screen.findByTestId(ITEM);
      expect(item).toHaveTextContent('Mi pasantía');
      expect(fetchMock).toHaveBeenCalledWith('/api/pasantias/mine', { credentials: 'same-origin' });
      fireEvent.click(item);
      expect(mocks.router.push).toHaveBeenCalledWith('/profile/pasantia');
    }
  );

  it('on its own page it is the active entry, and "Mi Perfil" is not', async () => {
    mocks.router.asPath = '/profile/pasantia';
    try {
      fetchMock.mockImplementation(() => answer({ hasPasantia: true }));
      render(sidebar('docente'));
      const item = await screen.findByTestId(ITEM);
      expect(item.className).toContain('bg-[#0a0a0a]');
      expect(screen.getByTestId('sidebar-item-profile').className).not.toContain('bg-[#0a0a0a] text-white');
    } finally {
      mocks.router.asPath = '/dashboard';
    }
  });

  it('hides it from everyone else, and while the answer has not arrived', async () => {
    fetchMock.mockImplementation(() => answer({ hasPasantia: false }));
    render(sidebar('docente'));
    expect(screen.queryByTestId(ITEM)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId(ITEM)).not.toBeInTheDocument();
  });

  it.each([
    ['a failed request', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['an error answer that still carries a body', () => answer({ hasPasantia: true }, false)],
    ['an answer of another shape', () => answer({ hasPasantia: 'yes' })],
  ])('hides it on %s', async (_label, reply) => {
    fetchMock.mockImplementation(reply);
    render(sidebar('docente'));
    await act(async () => {});
    expect(screen.queryByTestId(ITEM)).not.toBeInTheDocument();
  });

  it('keeps the answer for the tab: the next page does not ask again, and another account is asked separately', async () => {
    fetchMock.mockImplementation(() => answer({ hasPasantia: true }));
    const first = render(sidebar('docente'));
    await screen.findByTestId(ITEM);
    first.unmount();
    render(sidebar('docente'));
    expect(await screen.findByTestId(ITEM)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    render(sidebar('docente', 'synthetic-adult-b'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('a failed request is not remembered: the next page asks again', async () => {
    fetchMock.mockImplementationOnce(() => answer({ hasPasantia: true }, false));
    const first = render(sidebar('docente'));
    await act(async () => {});
    first.unmount();
    fetchMock.mockImplementation(() => answer({ hasPasantia: true }));
    render(sidebar('docente'));
    expect(await screen.findByTestId(ITEM)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks nothing when nobody is signed in', async () => {
    render(sidebar('docente', null));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId(ITEM)).not.toBeInTheDocument();
  });

  it('never shows the previous account\'s answer after a session change', async () => {
    let finishA!: (value: unknown) => void;
    let finishB!: (value: unknown) => void;
    let calls = 0;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          calls += 1;
          if (calls === 1) finishA = resolve;
          else finishB = resolve;
        })
    );
    const view = render(sidebar('docente'));
    view.rerender(sidebar('docente', 'synthetic-adult-b'));
    await act(async () => {
      finishA({ ok: true, status: 200, json: () => Promise.resolve({ hasPasantia: true }) });
    });
    expect(screen.queryByTestId(ITEM)).not.toBeInTheDocument();
    await act(async () => {
      finishB({ ok: true, status: 200, json: () => Promise.resolve({ hasPasantia: false }) });
    });
    expect(screen.queryByTestId(ITEM)).not.toBeInTheDocument();
  });
});
