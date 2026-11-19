// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F15b (RD-a): /notifications opened by a reload or a typed address. While the
 * session is still loading the page must not decide anything; it used to take
 * the not-yet-loaded session for "nobody signed in", go to /login, and the
 * sign-in page then sent a signed-in person to the panel.
 */

const auth = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  isLoading: true,
  tables: [] as string[],
}));

vi.mock('@supabase/auth-helpers-react', () => {
  const chain = (): any => {
    const result = { data: [], error: null };
    const q: any = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko),
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    const proxy: any = new Proxy(q, { get: (t, k) => (k in t ? t[k] : () => proxy) });
    return proxy;
  };
  const client = {
    from: (table: string) => {
      auth.tables.push(table);
      return chain();
    },
    auth: {
      getUser: async () => ({ data: { user: auth.session?.user ?? null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    rpc: () => chain(),
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  };
  return {
    useSupabaseClient: () => client,
    // The real hook answers null while the session is still loading.
    useSession: () => (auth.isLoading ? null : auth.session),
    useSessionContext: () => ({ session: auth.session, isLoading: auth.isLoading, error: null, supabaseClient: client }),
  };
});
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const router = { query: {} as Record<string, string>, push: vi.fn(), pathname: '/notifications', asPath: '/notifications' };
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({ default: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/notifications/NotificationDeleteModal', () => ({ default: () => null }));
vi.mock('../../utils/roleUtils', () => ({ getUserPrimaryRole: async () => 'docente' }));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

(globalThis as any).React = React;

import NotificationsPage from '../../pages/notifications';

const SIGNED_IN = { user: { id: 'user-f15b-1', email: 'persona@f15b.test.local' } };

beforeEach(() => {
  auth.session = null;
  auth.isLoading = true;
  auth.tables.length = 0;
  router.query = {};
  router.push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('/notifications opened directly (RD-a)', () => {
  it('while the session is loading, the router is not told to go anywhere', async () => {
    render(<NotificationsPage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(router.push).not.toHaveBeenCalled();
    expect(auth.tables).not.toContain('user_notifications');
  });

  it('once loading has ended with a session, the notifications are asked for and no redirect happens', async () => {
    const view = render(<NotificationsPage />);
    auth.session = SIGNED_IN;
    auth.isLoading = false;
    view.rerender(<NotificationsPage />);
    await waitFor(() => expect(auth.tables).toContain('user_notifications'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('once loading has ended without a session, the router goes to /login?next=%2Fnotifications', async () => {
    const view = render(<NotificationsPage />);
    auth.isLoading = false;
    view.rerender(<NotificationsPage />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/login?next=%2Fnotifications'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(auth.tables).not.toContain('user_notifications');
  });
});
