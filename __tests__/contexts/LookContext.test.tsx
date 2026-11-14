// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).React = React;

/**
 * Redesign 4d — LookProvider turns the profile's choice into `data-look` on <html>.
 * AuthContext is the only thing replaced: it is where the profile comes from.
 */

const { authState } = vi.hoisted(() => ({
  authState: { user: null as null | { id: string }, profile: null as null | Record<string, unknown>, loading: true },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }));

import { LookProvider, useLook } from '../../contexts/LookContext';

const root = () => document.documentElement;

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
});
afterEach(() => {
  root().removeAttribute('data-look');
  window.localStorage.clear();
});

describe('LookProvider', () => {
  it('while the profile loads it leaves the page as the early script left it', () => {
    root().setAttribute('data-look', 'nuevo');
    window.localStorage.setItem('genera.look', 'nuevo');
    render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    expect(window.localStorage.getItem('genera.look')).toBe('nuevo');
  });

  it('signed out: today\'s look, and a look left behind by another session is removed', () => {
    root().setAttribute('data-look', 'nuevo');
    window.localStorage.setItem('genera.look', 'nuevo');
    Object.assign(authState, { loading: false });
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(window.localStorage.getItem('genera.look')).toBeNull();
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('an account that never chose: no attribute, nothing stored', () => {
    Object.assign(authState, { loading: false, user: { id: 'u1' }, profile: { learning_preferences: {} } });
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('an account that chose the new look gets the attribute; signing out removes it', () => {
    Object.assign(authState, { loading: false, user: { id: 'u1' }, profile: { learning_preferences: { ui_look: 'nuevo' } } });
    const { rerender } = render(tree());
    expect(root().getAttribute('data-look')).toBe('nuevo');
    expect(screen.getByTestId('look')).toHaveTextContent('nuevo');
    Object.assign(authState, { user: null, profile: null });
    rerender(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
    expect(screen.getByTestId('look')).toHaveTextContent('clasico');
  });

  it('a profile without a signed-in user does not count', () => {
    Object.assign(authState, { loading: false, user: null, profile: { learning_preferences: { ui_look: 'nuevo' } } });
    render(tree());
    expect(root().hasAttribute('data-look')).toBe(false);
  });

  it('setLook shows a look at once and keeps it across re-renders with the same profile', () => {
    Object.assign(authState, { loading: false, user: { id: 'u1' }, profile: { learning_preferences: {} } });
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
