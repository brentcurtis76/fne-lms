// @vitest-environment jsdom
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).React = React;

/**
 * Redesign 5b, send-back 1: the context's value changes only when the look changes.
 *
 * `setLook` keeps one identity for the provider's whole life, so a change of the loading state or of
 * the account that leaves the look at today's look gives readers the same value object, and a reader
 * inside `React.memo` (the frame's Sidebar) is not rendered again. The accounts are invented.
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

function signedIn(id: string, profile: Record<string, unknown> | null, loading = false) {
  sessionState.session = { user: { id } };
  Object.assign(authState, { loading, user: { id }, profile });
}

const values: Array<ReturnType<typeof useLook>> = [];
let memoRenders = 0;

/** Not memoised: records the value object of every render. */
function Recorder() {
  values.push(useLook());
  return null;
}

/** Memoised, no props: renders again only when the context's value changes. */
const MemoReader = React.memo(function MemoReader() {
  memoRenders += 1;
  const { look } = useLook();
  return <span data-testid="memo-look">{look}</span>;
});

/** Not memoised, so the provider's parent re-rendering reaches the provider. */
function tree(tick: number) {
  return (
    <LookProvider>
      <span data-tick={tick} />
      <Recorder />
      <MemoReader />
    </LookProvider>
  );
}

beforeEach(() => {
  values.length = 0;
  memoRenders = 0;
  Object.assign(authState, { user: null, profile: null, loading: true });
  sessionState.session = null;
  routerState.pathname = '/dashboard';
});
afterEach(() => {
  document.documentElement.removeAttribute('data-look');
});

describe('LookProvider: one value while the look stays today\'s (5b, send-back 1)', () => {
  it('the value object is the same across a change of loading and of the account; a memoised reader renders once', () => {
    const nonTester = (id: string) => ({ id, can_run_qa_tests: false, learning_preferences: {} });
    const tester = (id: string) => ({ id, can_run_qa_tests: true, learning_preferences: {} });

    // Loading, no account yet.
    const { rerender, getByTestId } = render(tree(0));
    // Loading ends: account A, today's look.
    signedIn(A, nonTester(A));
    rerender(tree(1));
    // Loading again (A's profile reloading).
    Object.assign(authState, { loading: true });
    rerender(tree(2));
    // Another account, B, still loading, then loaded; today's look throughout.
    signedIn(B, tester(B), true);
    rerender(tree(3));
    signedIn(B, tester(B));
    rerender(tree(4));
    // Signed out.
    sessionState.session = null;
    Object.assign(authState, { user: null, profile: null, loading: false });
    rerender(tree(5));

    expect(values.length).toBeGreaterThanOrEqual(6);
    for (const value of values) {
      expect(value.look).toBe('clasico');
      expect(value).toBe(values[0]);
      expect(value.setLook).toBe(values[0].setLook);
    }
    expect(memoRenders).toBe(1);
    expect(getByTestId('memo-look')).toHaveTextContent('clasico');
  });

  it('a change of look still reaches the memoised reader, and setLook keeps its identity', () => {
    signedIn(A, { id: A, can_run_qa_tests: true, learning_preferences: {} });
    const { getByTestId } = render(tree(0));
    expect(memoRenders).toBe(1);
    const first = values[values.length - 1];
    act(() => first.setLook('nuevo'));
    expect(getByTestId('memo-look')).toHaveTextContent('nuevo');
    expect(memoRenders).toBe(2);
    const last = values[values.length - 1];
    expect(last.look).toBe('nuevo');
    expect(last).not.toBe(first);
    expect(last.setLook).toBe(first.setLook);
  });

  it('the one setLook is made on the facts of the moment it is called: a choice made before a change of account is not shown after it', () => {
    signedIn(A, { id: A, can_run_qa_tests: true, learning_preferences: {} });
    const { rerender, getByTestId } = render(tree(0));
    const setLook = values[values.length - 1].setLook;
    act(() => setLook('nuevo'));
    expect(document.documentElement.getAttribute('data-look')).toBe('nuevo');
    signedIn(B, { id: B, can_run_qa_tests: true, learning_preferences: {} });
    rerender(tree(1));
    expect(getByTestId('memo-look')).toHaveTextContent('clasico');
    expect(document.documentElement.hasAttribute('data-look')).toBe(false);
    // Called again after the change, the same function counts for B, on B's facts.
    act(() => setLook('nuevo'));
    expect(getByTestId('memo-look')).toHaveTextContent('nuevo');
  });
});
