// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).React = React;

/**
 * F15a (N63) — on a full page load the sign-in state arrives after the first render.
 * While it is not known who the person is, the permissions must stay "loading";
 * a known person stays "loading" until their permissions have arrived.
 * Replaced: the session (auth-helpers) and the database client. Invented people only.
 */

const PERSON = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Answer = { data: unknown; error: unknown };

const { session, db } = vi.hoisted(() => {
  const session = {
    isLoading: true,
    user: null as null | { id: string; user_metadata: Record<string, unknown> },
  };
  const db = {
    calls: [] as string[],
    pending: {} as Record<string, Array<(a: Answer) => void>>,
  };
  return { session, db };
});

function resolveTable(table: string, answer: Answer) {
  const waiting = db.pending[table] || [];
  db.pending[table] = [];
  waiting.forEach((resolve) => resolve(answer));
}

const supabase = {
  from(table: string) {
    db.calls.push(table);
    const promise = new Promise<Answer>((resolve) => {
      (db.pending[table] = db.pending[table] || []).push(resolve);
    });
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
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

import { PermissionProvider, usePermissions } from '../../contexts/PermissionContext';

const seen: Array<{ loading: boolean; count: number; quotes: boolean }> = [];

function Probe() {
  const { loading, permissions, hasPermission } = usePermissions();
  seen.push({ loading, count: Object.keys(permissions).length, quotes: hasPermission('view_internship_proposals_all') });
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="quotes">{String(hasPermission('view_internship_proposals_all'))}</span>
    </div>
  );
}

const tree = () => (
  <PermissionProvider>
    <Probe />
  </PermissionProvider>
);

beforeEach(() => {
  session.isLoading = true;
  session.user = null;
  db.calls = [];
  db.pending = {};
  seen.length = 0;
  localStorage.clear();
});

describe('PermissionProvider when the sign-in state arrives late (full page load)', () => {
  it('stays loading while the person is unknown, and until their permissions arrive', async () => {
    const view = render(tree());

    // Before the fix this line failed: loading was already false, with an empty set, for an unknown person.
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(db.calls).toEqual([]);

    // The sign-in state arrives: a consultant who holds the quotes permission.
    session.isLoading = false;
    session.user = { id: PERSON, user_metadata: { roles: ['consultor'] } };
    await act(async () => {
      view.rerender(tree());
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {
      resolveTable('user_roles', { data: [{ role_type: 'consultor' }], error: null });
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {
      resolveTable('role_permissions', {
        data: [{ permission_key: 'view_internship_proposals_all', granted: true }],
        error: null,
      });
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');

    // Never, at any render, "finished" with an empty set.
    expect(seen.some((s) => !s.loading && s.count === 0)).toBe(false);
  });

  it('nobody signed in (known): no permissions and loading finished, as today', async () => {
    const view = render(tree());
    session.isLoading = false;
    await act(async () => {
      view.rerender(tree());
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('false');
  });

  it('a failed answer for a known person: no permissions and loading finished, as today', async () => {
    session.isLoading = false;
    session.user = { id: PERSON, user_metadata: {} };
    render(tree());
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    await act(async () => {
      resolveTable('user_roles', { data: null, error: { message: 'invented failure' } });
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('false');
  });

  it('cached permissions for the person are still shown early, and kept while the person is unknown', async () => {
    localStorage.setItem(`permissions_${PERSON}`, JSON.stringify({ view_internship_proposals_all: true }));
    const view = render(tree());
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    // Before the fix this line failed: the unknown person was taken as "signed out" and the cache was wiped.
    expect(localStorage.getItem(`permissions_${PERSON}`)).not.toBeNull();
    session.isLoading = false;
    session.user = { id: PERSON, user_metadata: {} };
    await act(async () => {
      view.rerender(tree());
    });
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');
    await act(async () => {
      resolveTable('user_roles', { data: [{ role_type: 'consultor' }], error: null });
    });
    await act(async () => {
      resolveTable('role_permissions', {
        data: [{ permission_key: 'view_internship_proposals_all', granted: true }],
        error: null,
      });
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');
  });
});
