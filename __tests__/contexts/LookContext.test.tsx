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

const { authState, sessionState } = vi.hoisted(() => ({
  authState: { user: null as null | { id: string }, profile: null as null | Record<string, unknown>, loading: true },
  sessionState: { session: null as null | { user: { id: string } } },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSessionContext: () => sessionState }));

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

  it('outside the provider the hook answers today\'s look', () => {
    render(<Probe />);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });
});
