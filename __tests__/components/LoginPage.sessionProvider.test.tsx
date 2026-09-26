// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SessionContextProvider, useSessionContext } from '@supabase/auth-helpers-react';
import { AuthError } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), query: {}, isReady: true },
}));
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('../../utils/profileCompletionCheck', () => ({ checkProfileCompletionSimple: vi.fn(async () => true) }));
import LoginPage from '../../pages/login';

function ContextProbe() {
  const { session, error } = useSessionContext();
  return <output data-testid="context">{error ? 'error' : session ? 'session' : 'empty'}</output>;
}

describe('login with the installed SessionContextProvider', () => {
  it('contains the sticky initialization error and recovers after a fresh provider mount', async () => {
    mocks.router.push.mockClear();
    mocks.router.push.mockImplementation(async (path: string) => {
      window.history.replaceState({}, '', path);
      return true;
    });
    window.history.replaceState({}, '', '/login');
    const session = { user: { id: '11111111-1111-4111-8111-111111111111' }, access_token: 'synthetic' };
    let emit!: (event: string, session: any) => void;
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new AuthError('Synthetic initialization failure', 503) }),
        onAuthStateChange: vi.fn((callback) => {
          emit = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        getUser: vi.fn(async () => ({ data: { user: session.user }, error: null })),
        signInWithPassword: vi.fn(),
      },
      rpc: vi.fn(async () => ({ data: false, error: null })),
    };
    const tree = () => <SessionContextProvider supabaseClient={client as any}><ContextProbe /><LoginPage /></SessionContextProvider>;
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(tree()); });
    expect(screen.getByTestId('context')).toHaveTextContent('error');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
    await act(async () => { emit('SIGNED_IN', session); });
    // Real dependency retains its error even after the successful auth event.
    expect(screen.getByTestId('context')).toHaveTextContent('error');
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    view.unmount();
    client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    await act(async () => { render(tree()); });
    expect(screen.getByTestId('context')).toHaveTextContent('session');
    expect(mocks.router.push).toHaveBeenCalledTimes(1);
    expect(mocks.router.push).toHaveBeenCalledWith('/dashboard');
  });
});
