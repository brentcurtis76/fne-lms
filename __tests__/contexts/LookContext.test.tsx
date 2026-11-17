// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).React = React;

/**
 * Redesign 4d — LookProvider turns the profile's choice into `data-look` on <html>.
 * Replaced: the session (auth-helpers) and AuthContext, which is where the profile comes from.
 */

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { authState, sessionState, routerState } = vi.hoisted(() => ({
  authState: { user: null as null | { id: string }, profile: null as null | Record<string, unknown>, loading: true },
  sessionState: { session: null as null | { user: { id: string } } },
  routerState: { pathname: '/dashboard' },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSessionContext: () => sessionState }));
vi.mock('next/router', () => ({ useRouter: () => routerState }));

import { LookProvider, useLook } from '../../contexts/LookContext';

const root = () => document.documentElement;
const tester = (id: string, preferences: unknown) => ({ id, can_run_qa_tests: true, learning_preferences: preferences });

function signedIn(id: string, profile: Record<string, unknown> | null) {
  sessionState.session = { user: { id } };
  Object.assign(authState, { loading: false, user: { id }, profile });
}

function Probe() {
  const { look, setLook } = useLook();
  return (
    <div>
      <span data-testid="look">{look}</span>
      <button type="button" onClick={() => setLook('nuevo')}>
        nuevo
      </button>
      <button type="button" onClick={() => setLook('clasico')}>
        clasico
      </button>
    </div>
  );
}

const tree = () => (
  <LookProvider>
    <Probe />
  </LookProvider>
);

beforeEach(() => {
  Object.assign(authState, { user: null, profile: null, loading: true });
  sessionState.session = null;
  routerState.pathname = '/dashboard';
});
afterEach(() => {
  root().removeAttribute('data-look');
});

describe('LookProvider', () => {
  it('while the profile loads it leaves the page as it is', () => {
    root().setAttribute('data-look', 'nuevo');
    render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
  });

  it('signed out: today\'s look, and a look left on the page is removed', () => {
    root().setAttribute('data-look', 'nuevo');
    Object.assign(authState, { loading: false });
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('an account that never chose: no attribute, nothing kept in the browser', () => {
    signedIn(A, tester(A, {}));
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('a tester who chose the new look gets the attribute; signing out removes it', () => {
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    expect(screen.getByTestId('look')).toHaveTextContent('nuevo');
    expect(window.localStorage.length).toBe(0);
    sessionState.session = null;
    Object.assign(authState, { user: null, profile: null });
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('an account that is not a tester is not shown the new look, whatever its profile holds', () => {
    signedIn(A, { id: A, can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } });
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('a tester who stops being one goes back to today\'s look', () => {
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    Object.assign(authState, { profile: { id: A, can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } } });
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
  });

  it('another account signs in in the same tab: the previous account\'s profile does not count', () => {
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    // The session is already B's; AuthContext still holds A's user and profile until B's have loaded.
    sessionState.session = { user: { id: B } };
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    // B's own profile arrives.
    Object.assign(authState, { user: { id: B }, profile: tester(B, { ui_look: 'nuevo' }) });
    rerender(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
  });

  it('a session gone while AuthContext still holds the account: today\'s look', () => {
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    sessionState.session = null;
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
  });

  it('setLook shows a look at once and keeps it across re-renders with the same profile', () => {
    signedIn(A, tester(A, {}));
    const { rerender } = render(tree());
    act(() => screen.getByText('nuevo').click());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    rerender(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    act(() => screen.getByText('clasico').click());
    expect(root().hasAttribute('data-look')).toBe(false);
  });

  it('5a: on /login a tester who chose the new look gets no attribute, and the hook answers today\'s look', () => {
    routerState.pathname = '/login';
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('5a: on /dashboard the same tester gets the attribute', () => {
    routerState.pathname = '/dashboard';
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    expect(screen.getByTestId('look')).toHaveTextContent('nuevo');
  });

  it('5a: going to the public home page and back drops and restores the attribute without a reload', () => {
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    routerState.pathname = '/';
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
    routerState.pathname = '/noticias/[slug]';
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    routerState.pathname = '/admin/user-management';
    rerender(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    expect(screen.getByTestId('look')).toHaveTextContent('nuevo');
  });

  it('5a: a look chosen on «Apariencia» survives a visit to a page outside the look', () => {
    routerState.pathname = '/configuracion/apariencia';
    signedIn(A, tester(A, {}));
    const { rerender } = render(tree());
    act(() => screen.getByText('nuevo').click());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    routerState.pathname = '/login';
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    routerState.pathname = '/configuracion/apariencia';
    rerender(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
  });

  it('5a: a page outside the look removes a look left on the page even while the profile loads', () => {
    root().setAttribute('data-look', 'nuevo');
    routerState.pathname = '/login';
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
  });

  it('outside the provider the hook answers today\'s look', () => {
    render(<Probe />);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });
});

describe('LookProvider: the account and the route change in the same render (5a, send-back 1)', () => {
  const N = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const nonTester = (id: string) => ({ id, can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } });
  const attr = () => root().getAttribute('data-look');
  const shown = () => screen.getByTestId('look').textContent;

  it('tester with the new look on /login, then a non-tester and /dashboard at once: today\'s look', () => {
    routerState.pathname = '/login';
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    expect(attr()).toBeNull();
    signedIn(N, nonTester(N));
    routerState.pathname = '/dashboard';
    rerender(tree());
    expect(attr()).toBeNull();
    expect(shown()).toBe('clasico');
  });

  it('the same, with the non-tester\'s profile loading in between', () => {
    routerState.pathname = '/login';
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    // N's session arrives; AuthContext still holds A's user and profile while N's loads.
    sessionState.session = { user: { id: N } };
    authState.loading = true;
    rerender(tree());
    expect(attr()).toBeNull();
    // N's profile and the route to /dashboard arrive together.
    signedIn(N, nonTester(N));
    routerState.pathname = '/dashboard';
    rerender(tree());
    expect(attr()).toBeNull();
    expect(shown()).toBe('clasico');
  });

  it('the same, with loading and the route change in one render, then the profile', () => {
    routerState.pathname = '/login';
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    const { rerender } = render(tree());
    sessionState.session = { user: { id: N } };
    authState.loading = true;
    routerState.pathname = '/dashboard';
    rerender(tree());
    expect(attr()).toBeNull();
    signedIn(N, nonTester(N));
    rerender(tree());
    expect(attr()).toBeNull();
    expect(shown()).toBe('clasico');
  });

  it('non-tester on /login, then a tester with the new look and /dashboard at once: the new look', () => {
    routerState.pathname = '/login';
    signedIn(N, nonTester(N));
    const { rerender } = render(tree());
    expect(attr()).toBeNull();
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    routerState.pathname = '/dashboard';
    rerender(tree());
    expect(attr()).toBe('nuevo');
    expect(shown()).toBe('nuevo');
  });

  it('the same, with the tester\'s profile loading in between', () => {
    routerState.pathname = '/login';
    signedIn(N, nonTester(N));
    const { rerender } = render(tree());
    sessionState.session = { user: { id: A } };
    authState.loading = true;
    rerender(tree());
    expect(attr()).toBeNull();
    signedIn(A, tester(A, { ui_look: 'nuevo' }));
    routerState.pathname = '/dashboard';
    rerender(tree());
    expect(attr()).toBe('nuevo');
    expect(shown()).toBe('nuevo');
  });

  it('a choice saved through setLook does not outlive its account, not even when it signs in again', () => {
    routerState.pathname = '/configuracion/apariencia';
    signedIn(A, tester(A, {}));
    const { rerender } = render(tree());
    act(() => screen.getByRole('button', { name: 'nuevo' }).click());
    expect(attr()).toBe('nuevo');
    // Another tester with today's look, on an outside page and back at once.
    signedIn(B, tester(B, {}));
    routerState.pathname = '/dashboard';
    rerender(tree());
    expect(attr()).toBeNull();
    signedIn(A, tester(A, {}));
    rerender(tree());
    expect(attr()).toBeNull();
    expect(shown()).toBe('clasico');
  });

  it('a choice saved through setLook never shows for an account that is not offered the choice', () => {
    signedIn(N, { id: N, can_run_qa_tests: false, learning_preferences: {} });
    render(tree());
    act(() => screen.getByRole('button', { name: 'nuevo' }).click());
    expect(attr()).toBeNull();
    expect(shown()).toBe('clasico');
  });
});

/**
 * Property-style: generated sequences of steps. After every step the attribute on <html> must be what
 * `expectedAttribute` (a small pure function of the facts of that moment) says, and the hook must agree
 * with the attribute whenever nothing is loading.
 */
describe('LookProvider: generated sequences (5a, send-back 1)', () => {
  const ACCOUNTS = {
    testerNuevo: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', can_run_qa_tests: true, learning_preferences: { ui_look: 'nuevo' } },
    testerClasico: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', can_run_qa_tests: true, learning_preferences: {} },
    nonTester: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } },
  } as const;
  type Kind = keyof typeof ACCOUNTS;
  const KINDS = Object.keys(ACCOUNTS) as Kind[];
  const PLATFORM = ['/dashboard', '/configuracion/apariencia', '/admin/user-management'];
  const OUTSIDE = ['/login', '/', '/noticias/[slug]', '/404'];

  type Profile = { id: string; can_run_qa_tests: boolean; learning_preferences: Record<string, unknown> };
  interface Facts {
    session: string | null;
    user: string | null;
    profile: Profile | null;
    loading: boolean;
    pathname: string;
  }
  interface Saved {
    look: 'clasico' | 'nuevo';
    facts: { session: string | null; stored: 'clasico' | 'nuevo'; loading: boolean };
  }

  const isOutside = (pathname: string) => OUTSIDE.includes(pathname);
  const storedLook = (f: Facts): 'clasico' | 'nuevo' => {
    const own = f.session !== null && f.user === f.session && f.profile?.id === f.session;
    if (!own || !f.profile?.can_run_qa_tests) return 'clasico';
    return f.profile.learning_preferences.ui_look === 'nuevo' ? 'nuevo' : 'clasico';
  };
  const savedCounts = (f: Facts, saved: Saved | null): saved is Saved =>
    saved !== null &&
    saved.facts.session === f.session &&
    saved.facts.stored === storedLook(f) &&
    saved.facts.loading === f.loading;
  const accountOffered = (f: Facts) =>
    f.session !== null && f.user === f.session && f.profile?.id === f.session && f.profile.can_run_qa_tests;

  /** The pure answer: "nuevo", null (absent), or "leave" (whatever was there before). */
  function expectedAttribute(f: Facts, saved: Saved | null): 'nuevo' | null | 'leave' {
    if (isOutside(f.pathname)) return null;
    if (f.loading) return 'leave';
    const look = savedCounts(f, saved) && accountOffered(f) ? saved.look : storedLook(f);
    return look === 'nuevo' ? 'nuevo' : null;
  }

  type Op =
    | { op: 'signIn'; kind: Kind }
    | { op: 'signInPending'; kind: Kind }
    | { op: 'signOut' }
    | { op: 'go'; pathname: string }
    | { op: 'loadStart' }
    | { op: 'loadEnd' };
  type Step = { ops: Op[] } | { setLook: 'clasico' | 'nuevo' };

  // mulberry32: a small seeded generator, so a failure names a sequence that can be replayed.
  const generator = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function randomOp(next: () => number): Op {
    const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)];
    switch (pick(['signIn', 'signIn', 'signInPending', 'signOut', 'platform', 'outside', 'loadStart', 'loadEnd'] as const)) {
      case 'signIn':
        return { op: 'signIn', kind: pick(KINDS) };
      case 'signInPending':
        return { op: 'signInPending', kind: pick(KINDS) };
      case 'signOut':
        return { op: 'signOut' };
      case 'platform':
        return { op: 'go', pathname: pick(PLATFORM) };
      case 'outside':
        return { op: 'go', pathname: pick(OUTSIDE) };
      case 'loadStart':
        return { op: 'loadStart' };
      default:
        return { op: 'loadEnd' };
    }
  }
  function sequence(seed: number): Step[] {
    const next = generator(seed);
    return Array.from({ length: 14 }, () => {
      if (next() < 0.15) return { setLook: next() < 0.5 ? 'nuevo' : 'clasico' };
      // One or two changes in the same render: an account and a route together is the case that broke.
      return { ops: next() < 0.45 ? [randomOp(next), randomOp(next)] : [randomOp(next)] };
    });
  }

  function applyOp(f: Facts, o: Op): Facts {
    switch (o.op) {
      case 'signIn': {
        const p = ACCOUNTS[o.kind];
        return { ...f, session: p.id, user: p.id, profile: { ...p, learning_preferences: { ...p.learning_preferences } }, loading: false };
      }
      case 'signInPending':
        // The session is the new account's; AuthContext still holds the previous user and profile.
        return { ...f, session: ACCOUNTS[o.kind].id, loading: true };
      case 'signOut':
        return { ...f, session: null, user: null, profile: null, loading: false };
      case 'go':
        return { ...f, pathname: o.pathname };
      case 'loadStart':
        return { ...f, loading: true };
      case 'loadEnd': {
        const p = Object.values(ACCOUNTS).find((a) => a.id === f.session);
        return p
          ? { ...f, user: p.id, profile: { ...p, learning_preferences: { ...p.learning_preferences } }, loading: false }
          : { ...f, user: null, profile: null, loading: false };
      }
    }
  }
  const pushFacts = (f: Facts) => {
    sessionState.session = f.session ? { user: { id: f.session } } : null;
    Object.assign(authState, { user: f.user ? { id: f.user } : null, profile: f.profile, loading: f.loading });
    routerState.pathname = f.pathname;
  };

  const SEEDS = Array.from({ length: 48 }, (_, i) => 1000 + i * 7919);

  it.each(SEEDS)('sequence %i: the attribute is always the pure answer, the hook agrees with it', (seed) => {
    let facts: Facts = { session: null, user: null, profile: null, loading: true, pathname: '/dashboard' };
    let saved: Saved | null = null;
    pushFacts(facts);
    const { rerender } = render(tree());
    let before: string | null = root().getAttribute('data-look');
    const log: string[] = [];

    const check = () => {
      // A saved choice made on other facts is forgotten (the provider forgets it at the next render).
      if (saved && !savedCounts(facts, saved)) saved = null;
      const expected = expectedAttribute(facts, saved);
      const actual = root().getAttribute('data-look');
      const where = `seed ${seed}, after: ${log.join(' | ')}`;
      expect(actual, where).toBe(expected === 'leave' ? before : expected);
      if (!facts.loading) expect(screen.getByTestId('look').textContent, where).toBe(actual === 'nuevo' ? 'nuevo' : 'clasico');
      before = actual;
    };
    check();

    for (const step of sequence(seed)) {
      if ('setLook' in step) {
        log.push(`setLook ${step.setLook}`);
        const look = step.setLook;
        act(() => screen.getByRole('button', { name: look }).click());
        saved = { look, facts: { session: facts.session, stored: storedLook(facts), loading: facts.loading } };
      } else {
        log.push(step.ops.map((o) => JSON.stringify(o)).join(' + '));
        for (const o of step.ops) facts = applyOp(facts, o);
        pushFacts(facts);
        rerender(tree());
      }
      check();
    }
  });
});

describe('LookProvider: the attribute arrives in the same commit as the look', () => {
  /**
   * A child's passive effect runs after every layout effect of its commit (and, among passive
   * effects, before its parent's). It records the attribute at the commit where `look` first reads
   * each new value: if the provider wrote the attribute in a passive effect, the child would still
   * see the look being left; written in a layout effect, it is already there.
   */
  it('setLook: at the commit where look changes, data-look already agrees with it, both ways', () => {
    signedIn(A, tester(A, {}));
    const seen: Array<{ look: string; attribute: string | null }> = [];

    function Recorder() {
      const { look } = useLook();
      const last = React.useRef<string | null>(null);
      React.useEffect(() => {
        if (look !== last.current) {
          last.current = look;
          seen.push({ look, attribute: root().getAttribute('data-look') });
        }
      }, [look]);
      return null;
    }

    render(
      <LookProvider>
        <Probe />
        <Recorder />
      </LookProvider>
    );
    expect(root().hasAttribute('data-look')).toBe(false);

    act(() => screen.getByRole('button', { name: 'nuevo' }).click());
    act(() => screen.getByRole('button', { name: 'clasico' }).click());

    expect(seen).toEqual([
      { look: 'clasico', attribute: null },
      { look: 'nuevo', attribute: 'nuevo' },
      { look: 'clasico', attribute: null },
    ]);
  });
});
