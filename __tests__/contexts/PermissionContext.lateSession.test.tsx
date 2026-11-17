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
    // Every query, with its filters, so one request can be answered on its own.
    queries: [] as Array<{ table: string; args: unknown[][]; resolve: (a: Answer) => void; done: boolean }>,
  };
  return { session, db };
});

function resolveTable(table: string, answer: Answer) {
  const waiting = db.pending[table] || [];
  db.pending[table] = [];
  waiting.forEach((resolve) => resolve(answer));
}

function resolveQuery(table: string, filter: unknown, answer: Answer) {
  const query = db.queries.find(
    (q) => !q.done && q.table === table && q.args.some((a) => JSON.stringify(a[1]) === JSON.stringify(filter)),
  );
  if (!query) throw new Error(`no open ${table} query for ${JSON.stringify(filter)}`);
  query.done = true;
  query.resolve(answer);
}

const supabase = {
  from(table: string) {
    db.calls.push(table);
    const args: unknown[][] = [];
    let resolveThis: (a: Answer) => void = () => {};
    const promise = new Promise<Answer>((resolve) => {
      resolveThis = resolve;
      (db.pending[table] = db.pending[table] || []).push(resolve);
    });
    db.queries.push({ table, args, resolve: (a) => resolveThis(a), done: false });
    const builder: any = {
      select: () => builder,
      eq: (...a: unknown[]) => (args.push(a), builder),
      in: (...a: unknown[]) => (args.push(a), builder),
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
  db.queries = [];
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

/**
 * F15a send-back 1 — the person changes without a page reload (A signs out, B signs in
 * in the same tab). A late answer for A must not touch B's permissions, B's saved copy
 * or the "settled" marker. Invented people only.
 */
const PERSON_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSON_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let refetchNow: () => Promise<void> = async () => {};

function RefetchProbe() {
  const { refetch } = usePermissions();
  refetchNow = refetch;
  return null;
}

const treeWithRefetch = () => (
  <PermissionProvider>
    <Probe />
    <RefetchProbe />
  </PermissionProvider>
);

async function switchTo(view: ReturnType<typeof render>, id: string) {
  session.user = { id, user_metadata: { roles: ['consultor'] } };
  await act(async () => {
    view.rerender(tree());
  });
}

async function answerB() {
  await act(async () => {
    resolveQuery('user_roles', PERSON_B, { data: [{ role_type: 'role-b' }], error: null });
  });
  await act(async () => {
    resolveQuery('role_permissions', ['role-b'], {
      data: [{ permission_key: 'view_internship_proposals_all', granted: true }],
      error: null,
    });
  });
}

describe('PermissionProvider when the person changes without a page reload', () => {
  it("a late answer for A, after B's answer, is dropped", async () => {
    session.isLoading = false;
    session.user = { id: PERSON_A, user_metadata: { roles: ['consultor'] } };
    const view = render(tree());
    expect(db.queries.filter((q) => q.table === 'user_roles')).toHaveLength(1);

    await switchTo(view, PERSON_B);
    await answerB();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');

    // A's answer arrives late (A holds a different permission, not the quotes one).
    await act(async () => {
      resolveQuery('user_roles', PERSON_A, { data: [{ role_type: 'role-a' }], error: null });
    });
    const aPerms = db.queries.find((q) => q.table === 'role_permissions' && !q.done);
    if (aPerms) {
      await act(async () => {
        resolveQuery('role_permissions', ['role-a'], {
          data: [{ permission_key: 'only_for_a', granted: true }],
          error: null,
        });
      });
    }

    // Before the fix these lines failed: A's answer overwrote B's permissions and
    // the "settled" marker, so B was left on loading for ever.
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');
    expect(JSON.parse(localStorage.getItem(`permissions_${PERSON_B}`) || 'null')).toEqual({
      view_internship_proposals_all: true,
    });
    expect(localStorage.getItem(`permissions_${PERSON_A}`)).toBeNull();
  });

  it("a late FAILURE of A's request, after B's answer, is dropped", async () => {
    session.isLoading = false;
    session.user = { id: PERSON_A, user_metadata: { roles: ['consultor'] } };
    const view = render(tree());

    await switchTo(view, PERSON_B);
    await answerB();
    expect(screen.getByTestId('loading')).toHaveTextContent('false');

    await act(async () => {
      resolveQuery('user_roles', PERSON_A, { data: null, error: { message: 'invented failure' } });
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');
    expect(JSON.parse(localStorage.getItem(`permissions_${PERSON_B}`) || 'null')).toEqual({
      view_internship_proposals_all: true,
    });
    expect(localStorage.getItem(`permissions_${PERSON_A}`)).toBeNull();
  });

  it('two requests for the same person answered in reversed order: the later request wins', async () => {
    session.isLoading = false;
    session.user = { id: PERSON, user_metadata: { roles: ['consultor'] } };
    render(treeWithRefetch());
    expect(db.queries.filter((q) => q.table === 'user_roles')).toHaveLength(1);

    // A second request for the same person (refetch), before the first has answered.
    await act(async () => {
      void refetchNow();
    });
    const roleQueries = db.queries.filter((q) => q.table === 'user_roles');
    expect(roleQueries).toHaveLength(2);

    // The later request answers first.
    await act(async () => {
      roleQueries[1].done = true;
      roleQueries[1].resolve({ data: [{ role_type: 'role-new' }], error: null });
    });
    await act(async () => {
      resolveQuery('role_permissions', ['role-new'], {
        data: [{ permission_key: 'view_internship_proposals_all', granted: true }],
        error: null,
      });
    });
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');

    // Then the earlier request answers.
    await act(async () => {
      roleQueries[0].done = true;
      roleQueries[0].resolve({ data: [{ role_type: 'role-old' }], error: null });
    });
    const oldPerms = db.queries.find((q) => q.table === 'role_permissions' && !q.done);
    if (oldPerms) {
      await act(async () => {
        resolveQuery('role_permissions', ['role-old'], {
          data: [{ permission_key: 'view_internship_proposals_all', granted: false }],
          error: null,
        });
      });
    }

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('quotes')).toHaveTextContent('true');
    expect(JSON.parse(localStorage.getItem(`permissions_${PERSON}`) || 'null')).toEqual({
      view_internship_proposals_all: true,
    });
  });
});
