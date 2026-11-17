// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).React = React;

/**
 * F15a (N63) — the quotes screen loaded in full (typed address, reload, Back):
 * the sign-in state arrives after the first render, then the permissions.
 * The real PermissionProvider and the real quotes page are used; replaced are the
 * session (auth-helpers), the database client, the router and the layout. Invented people only.
 */

const PERSON = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Answer = { data: unknown; error: unknown };

const { session, db, router } = vi.hoisted(() => ({
  session: {
    isLoading: true,
    user: null as null | { id: string; user_metadata: Record<string, unknown> },
  },
  db: { pending: {} as Record<string, Array<(a: Answer) => void>> },
  router: { push: vi.fn(), back: vi.fn(), pathname: '/admin/quotes', query: {}, asPath: '/admin/quotes' },
}));

function resolveTable(table: string, answer: Answer) {
  const waiting = db.pending[table] || [];
  db.pending[table] = [];
  waiting.forEach((resolve) => resolve(answer));
}

const supabase = {
  from(table: string) {
    const promise = new Promise<Answer>((resolve) => {
      (db.pending[table] = db.pending[table] || []).push(resolve);
    });
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      then: (ok: any, ko: any) => promise.then(ok, ko),
    };
    return builder;
  },
};

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabase,
  useUser: () => session.user,
  useSessionContext: () => ({
    isLoading: session.isLoading,
    session: session.user ? { user: session.user } : null,
    error: null,
    supabaseClient: supabase,
  }),
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { PermissionProvider } from '../../../contexts/PermissionContext';
import QuotesManagementPage from '../../../pages/admin/quotes/index';

const tree = () => (
  <PermissionProvider>
    <QuotesManagementPage />
  </PermissionProvider>
);

async function fullLoad(granted: boolean) {
  const view = render(tree());
  // Step 1: the person is not known yet.
  expect(screen.getByText('Verificando permisos...')).toBeInTheDocument();

  // Step 2: the sign-in state arrives (a consultant, not an admin).
  session.isLoading = false;
  session.user = { id: PERSON, user_metadata: { roles: ['consultor'] } };
  await act(async () => {
    view.rerender(tree());
  });

  // Step 3: their permissions arrive.
  await act(async () => {
    resolveTable('user_roles', { data: [{ role_type: 'consultor' }], error: null });
  });
  await act(async () => {
    resolveTable('role_permissions', {
      data: [{ permission_key: 'view_internship_proposals_all', granted }],
      error: null,
    });
  });
  await act(async () => {
    resolveTable('pasantias_quotes', { data: [], error: null });
  });
  return view;
}

beforeEach(() => {
  session.isLoading = true;
  session.user = null;
  db.pending = {};
  router.push.mockReset();
  localStorage.clear();
});

describe('Quotes page guard on a full load', () => {
  it('a person who holds the permission is not sent away', async () => {
    await fullLoad(true);
    // Before the fix this failed: the guard pushed '/admin' while the person was still unknown.
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByText('Verificando permisos...')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Cotizaciones - Pasantías Barcelona/ })).toBeInTheDocument();
  });

  it('a person without the permission is sent to /dashboard', async () => {
    await fullLoad(false);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('nobody signed in: sent away once it is known, as today (to /dashboard now)', async () => {
    const view = render(tree());
    expect(router.push).not.toHaveBeenCalled();
    session.isLoading = false;
    await act(async () => {
      view.rerender(tree());
    });
    expect(router.push).toHaveBeenCalledWith('/dashboard');
  });
});
