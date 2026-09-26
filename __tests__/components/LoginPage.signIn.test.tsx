// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const state = vi.hoisted(() => ({
  session: null as any,
  loading: false,
  error: null as any,
  client: null as any,
  router: { push: vi.fn(), replace: vi.fn(), query: {} as Record<string, unknown>, isReady: true },
  profile: vi.fn(),
}));
vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSessionContext: () => ({ session: state.session, isLoading: state.loading, error: state.error }),
  useSupabaseClient: () => state.client,
}));
vi.mock('../../utils/profileCompletionCheck', () => ({
  checkProfileCompletionSimple: (...args: unknown[]) => state.profile(...args),
}));

import LoginPage, { LOGIN_TIMEOUT_MS } from '../../pages/login';

const USER = { id: '11111111-1111-4111-8111-111111111111' };
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function submit() {
  fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'synthetic@example.test' } });
  fireEvent.change(screen.getByLabelText(/^Contraseña$/), { target: { value: 'Synthetic2026' } });
  await act(async () => { fireEvent.submit(screen.getByRole('button', { name: /Iniciar Sesión/i }).closest('form')!); });
}
async function expire() {
  await act(async () => { await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS); });
}
function expectRecovery() {
  expect(screen.getByRole('alert')).toHaveTextContent('Revisa tu conexión');
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  expect(screen.queryByText('Iniciando sesión...')).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.session = null;
  state.error = null;
  window.history.replaceState({}, '', '/login');
  state.loading = false;
  state.router.isReady = true;
  state.router.query = {};
  state.router.push.mockImplementation(async (path: string) => { window.history.replaceState({}, '', path); return true; });
  state.profile.mockResolvedValue(true);
  state.client = {
    auth: {
      signInWithPassword: vi.fn(async () => ({ data: { user: USER }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: USER }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ data: false, error: null })),
  };
});
afterEach(() => { vi.useRealTimers(); });

describe('login completion and recovery', () => {
  it('completes login with the new password through one checked redirect', async () => {
    render(<LoginPage />);
    await submit();
    expect(state.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'synthetic@example.test', password: 'Synthetic2026' });
    expect(state.client.rpc).toHaveBeenCalledWith('current_password_change_state');
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeEnabled();
  });

  it('does not redirect on SIGNED_IN until password-state checks finish', async () => {
    const flag = deferred();
    state.client.rpc.mockReturnValue(flag.promise);
    const view = render(<LoginPage />);
    await submit();
    state.session = { user: USER };
    view.rerender(<LoginPage />);
    expect(state.router.push).not.toHaveBeenCalled();
    await act(async () => { flag.resolve({ data: true, error: null }); });
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/change-password');
    expect(state.profile).not.toHaveBeenCalled();
    expect(state.client.auth.getUser).not.toHaveBeenCalled();
  });

  it('prevents simultaneous submissions before React flushes', async () => {
    state.client.auth.signInWithPassword.mockReturnValue(deferred().promise);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'synthetic@example.test' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/), { target: { value: 'Synthetic2026' } });
    const form = screen.getByRole('button', { name: /Iniciar Sesión/i }).closest('form')!;
    await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(state.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    await expire();
    expectRecovery();
  });

  it.each(['authentication', 'password-state', 'profile'])('recovers when %s stalls and ignores a late result', async (stage) => {
    const pending = deferred();
    const target = stage === 'authentication' ? state.client.auth.signInWithPassword
      : stage === 'password-state' ? state.client.rpc
      : stage === 'profile' ? state.profile : state.router.push;
    target.mockReturnValue(pending.promise);
    const view = render(<LoginPage />);
    await submit();
    await expire();
    expectRecovery();
    const navigations = state.router.push.mock.calls.length;
    await act(async () => {
      pending.resolve(stage === 'authentication' ? { data: { user: USER }, error: null }
        : stage === 'password-state' ? { data: false, error: null } : true);
    });
    state.session = { user: USER };
    view.rerender(<LoginPage />);
    expectRecovery();
    expect(state.router.push).toHaveBeenCalledTimes(navigations);
    expect(state.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it.each(['cancelled', 'rejected'])('recovers from %s navigation', async (outcome) => {
    if (outcome === 'cancelled') state.router.push.mockResolvedValue(false);
    else state.router.push.mockRejectedValue(new Error('Route loading failed'));
    render(<LoginPage />);
    await submit();
    expectRecovery();
  });

  it('gives a submitted login its full deadline after time spent on the form', async () => {
    state.client.auth.signInWithPassword.mockReturnValue(deferred().promise);
    render(<LoginPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await submit();
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    expect(screen.getByText('Iniciando sesión...')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expectRecovery();
  });

  it.each(['verification', 'cleanup'])('bounds stalled existing-session %s', async (stage) => {
    state.session = { user: USER };
    if (stage === 'verification') state.client.auth.getUser.mockReturnValue(deferred().promise);
    else {
      state.client.auth.getUser.mockResolvedValue({ data: {}, error: { status: 401 } });
      state.client.auth.signOut.mockReturnValue(deferred().promise);
    }
    await act(async () => { render(<LoginPage />); });
    await expire();
    expectRecovery();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it('allows slow navigation to finish beyond the network deadline', async () => {
    const navigation = deferred<boolean>();
    state.router.push.mockReturnValue(navigation.promise);
    render(<LoginPage />);
    await submit();
    await expire();
    expect(screen.getByText('Tu sesión está lista. Estamos cargando la página...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    await act(async () => {
      window.history.replaceState({}, '', '/dashboard');
      navigation.resolve(true);
    });
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('reports middleware returning to login despite a successful push', async () => {
    state.router.push.mockResolvedValue(true);
    render(<LoginPage />);
    await submit();
    expectRecovery();
  });

  it('accepts a later cross-tab session after incorrect credentials', async () => {
    state.client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    const view = render(<LoginPage />);
    await submit();
    state.session = { user: USER };
    await act(async () => { view.rerender(<LoginPage />); });
    expect(state.client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps an existing-session check on the neutral loading screen', async () => {
    state.session = { user: USER };
    state.client.auth.getUser.mockReturnValue(deferred().promise);
    render(<LoginPage />);
    expect(screen.getByText('Verificando sesión...')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Contraseña$/)).not.toBeInTheDocument();
    await expire();
    expectRecovery();
  });

  it('does not restart the initial deadline when router identity changes', async () => {
    state.loading = true;
    const view = render(<LoginPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    state.router = { ...state.router, isReady: false };
    view.rerender(<LoginPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expectRecovery();
  });

  it('records the failed stage and status without provider messages or credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      state.client.rpc.mockResolvedValue({ data: null, status: 503, error: { message: 'PRIVATE token email', code: 'PRIVATE' } });
      render(<LoginPage />);
      await submit();
      expect(log).toHaveBeenCalledWith('[Login] attempt failed', { stage: 'password-state', reason: 'request-failed', status: 503 });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE|Synthetic2026|synthetic@example/);
    } finally { log.mockRestore(); }
  });

  it('lets users correct an invalid password without reloading', async () => {
    state.client.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } });
    render(<LoginPage />);
    await submit();
    expect(screen.getByText('Correo o contraseña incorrectos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeEnabled();
    state.client.auth.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null });
    await submit();
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('fails closed when the password state cannot be checked', async () => {
    state.client.rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    render(<LoginPage />);
    await submit();
    expectRecovery();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it.each([null, 'false', undefined])('fails closed for malformed password state %s', async (data) => {
    state.client.rpc.mockResolvedValue({ data, error: null });
    render(<LoginPage />);
    await submit();
    expectRecovery();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it('checks an existing session and honors its forced password change', async () => {
    state.session = { user: USER };
    state.client.rpc.mockResolvedValue({ data: true, error: null });
    await act(async () => { render(<LoginPage />); });
    expect(state.client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/change-password');
  });

  it.each([{ status: 401 }, { status: 400, code: 'refresh_token_not_found' }, { status: 400, code: 'session_not_found' }])('clears stale session %j and accepts the new password', async (error) => {
    state.session = { user: USER };
    state.client.auth.getUser.mockResolvedValue({ data: { user: null }, error });
    await act(async () => { render(<LoginPage />); });
    expect(state.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.getByText('Tu sesión venció. Inicia sesión con tu nueva contraseña.')).toBeInTheDocument();
    expect(state.router.push).not.toHaveBeenCalled();
    await submit();
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('does not erase a session on a temporary provider failure', async () => {
    state.session = { user: USER };
    state.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    await act(async () => { render(<LoginPage />); });
    expectRecovery();
    expect(state.client.auth.signOut).not.toHaveBeenCalled();
  });

  it('waits for initial session resolution instead of allowing a competing login', async () => {
    state.loading = true;
    const view = render(<LoginPage />);
    expect(screen.getByText('Verificando sesión...')).toBeInTheDocument();
    state.loading = false;
    state.session = { user: USER };
    await act(async () => { view.rerender(<LoginPage />); });
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
    expect(state.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('recovers when the initial session never resolves', async () => {
    state.loading = true;
    render(<LoginPage />);
    await expire();
    expectRecovery();
  });

  it('honors safe deep links after successful checks', async () => {
    state.router.query = { next: '/courses?tab=assigned' };
    render(<LoginPage />);
    await submit();
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/courses?tab=assigned');
  });

  it.each(['/login', '/login?next=/login', '/logout', '/reset-password', 'https://outside.invalid', '/foo/../login/'])('rejects a looping or external destination %s', async (next) => {
    state.router.query = { next };
    render(<LoginPage />);
    await submit();
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps profile completion ahead of the requested destination', async () => {
    state.router.query = { next: '/courses' };
    state.profile.mockResolvedValue(false);
    render(<LoginPage />);
    await submit();
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/profile?from=login');
  });

  it('ignores work that resolves after unmount', async () => {
    const pending = deferred();
    state.client.auth.signInWithPassword.mockReturnValue(pending.promise);
    const view = render(<LoginPage />);
    await submit();
    view.unmount();
    await act(async () => { pending.resolve({ data: { user: USER }, error: null }); });
    expect(state.client.rpc).not.toHaveBeenCalled();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it('survives StrictMode effect cleanup without losing the existing-session redirect', async () => {
    state.session = { user: USER };
    await act(async () => { render(<StrictMode><LoginPage /></StrictMode>); });
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledWith('/dashboard');
  });
});
