// @vitest-environment jsdom
/**
 * S9 — the password-recovery request on /login.
 *
 * Three defects, all small and all user-visible:
 *
 *   - the address went to Supabase exactly as typed, so ` Nombre@Colegio.cl `
 *     from a copy-paste matched nothing — and, because the endpoint is
 *     deliberately silent about whether an account exists, the user was told the
 *     mail had been sent;
 *   - there was no in-flight state, so every impatient click issued another
 *     request, and each new recovery link invalidated the previous one;
 *   - the provider's error message was printed to the user, which leaked exactly
 *     the "does this account exist?" distinction the silent endpoint exists to
 *     hide.
 *
 * ROUND THREE. The request no longer goes to Supabase from the browser at all.
 * `resetPasswordForEmail` sends SUPABASE'S template with SUPABASE'S link, which
 * lands as an implicit `#access_token=` fragment or a PKCE `?code=` depending on
 * a dashboard setting — and neither of those can be turned into
 * server-verifiable, purpose-bound, one-time proof, which is what the recovery
 * ceremony now requires. The form posts to `/api/auth/recovery-request`, which
 * mints the same `?token_hash=` URL every other recovery path in this platform
 * sends. Everything S9 established — normalisation, in-flight state, one
 * acknowledgement on every path — still has to hold, so all of it is re-asserted
 * against the new transport.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const { mockRouterPush, supabaseHolder, sessionHolder } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  supabaseHolder: { current: null as any },
  sessionHolder: { current: null as any },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), query: {}, isReady: true }),
}));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
  useSession: () => sessionHolder.current,
}));
vi.mock('../../utils/profileCompletionCheck', () => ({
  checkProfileCompletionSimple: vi.fn(async () => true),
}));

import LoginPage from '../../pages/login';

const ACKNOWLEDGEMENT = /Si existe una cuenta con ese correo/;

interface ResetCall {
  email: string;
  url: string;
  headers: Record<string, string>;
}

/**
 * The Supabase client no longer takes part in the recovery request. It is still
 * needed for the rest of the page (session check, sign-in), and
 * `resetPasswordForEmail` is deliberately ABSENT from it so any reappearance is
 * a TypeError rather than a silent regression.
 */
function buildClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
      })),
    })),
  };
}

/** Stubs `fetch` and records what the page sent to /api/auth/recovery-request. */
function captureRecoveryRequests(
  opts: { status?: number; delayMs?: number; throws?: boolean } = {}
) {
  const resetCalls: ResetCall[] = [];

  global.fetch = vi.fn(async (url: any, init: any) => {
    const href = String(url);
    if (!href.includes('/api/auth/recovery-request')) {
      return { ok: true, status: 200, json: async () => ({}) } as any;
    }
    const body = JSON.parse(init?.body ?? '{}');
    resetCalls.push({ email: body.email, url: href, headers: init?.headers ?? {} });

    if (opts.throws) throw new Error('network down');
    if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));

    const status = opts.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => ({ message: 'ack' }),
    } as any;
  }) as any;

  return { resetCalls };
}

/** Renders the page and switches it into recovery mode. */
async function renderInResetMode() {
  render(<LoginPage />);
  // The page holds a 3s safety timeout before rendering; getSession resolves
  // immediately here, so one microtask flush is enough.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  fireEvent.click(screen.getByTestId('login-forgot-password'));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionHolder.current = null;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('S9 — e-mail normalisation', () => {
  it('trims surrounding whitespace before calling Supabase', async () => {
    const { resetCalls } = captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: '  persona@example.com  ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() => expect(resetCalls).toHaveLength(1));
    expect(resetCalls[0].email).toBe('persona@example.com');
  });

  it('lower-cases the address, matching how every address is stored', async () => {
    const { resetCalls } = captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'Persona@Colegio.CL' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() => expect(resetCalls).toHaveLength(1));
    expect(resetCalls[0].email).toBe('persona@colegio.cl');
  });

  it('does both at once', async () => {
    const { resetCalls } = captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: '\t  Nombre.Apellido@Colegio.CL \n' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() => expect(resetCalls).toHaveLength(1));
    expect(resetCalls[0].email).toBe('nombre.apellido@colegio.cl');
  });

  it('refuses a whitespace-only address without issuing a request', async () => {
    const { resetCalls } = captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), { target: { value: '   ' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    expect(resetCalls).toEqual([]);
    expect(screen.getByTestId('login-message').textContent).toContain(
      'Por favor ingresa tu correo electrónico'
    );
  });
});

describe('S9 — repeated submissions', () => {
  it('disables the button while a request is in flight', async () => {
    const { resetCalls } = captureRecoveryRequests({ delayMs: 40 });
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });

    act(() => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    expect(screen.getByTestId('login-reset-submit')).toBeDisabled();
    expect(screen.getByTestId('login-reset-back')).toBeDisabled();

    await waitFor(() => expect(screen.getByTestId('login-reset-submit')).not.toBeDisabled());
    expect(resetCalls).toHaveLength(1);
  });

  it('three rapid clicks issue ONE request — each extra link would invalidate the last', async () => {
    const { resetCalls } = captureRecoveryRequests({ delayMs: 40 });
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });

    act(() => {
      const button = screen.getByTestId('login-reset-submit');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(screen.getByTestId('login-reset-submit')).not.toBeDisabled());
    expect(resetCalls).toHaveLength(1);
  });

  it('a second request is allowed once the first has finished', async () => {
    const { resetCalls } = captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    expect(resetCalls).toHaveLength(2);
  });
});

describe('S9 — anti-enumeration', () => {
  it('answers the same on success', async () => {
    captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('login-message').textContent).toMatch(ACKNOWLEDGEMENT)
    );
  });

  it('answers IDENTICALLY when the provider returns an error', async () => {
    // The old code printed `'Error al enviar email: ' + error.message`, which
    // distinguishes "no such user" from "rate limited" — precisely the
    // distinction the deliberately-silent endpoint exists to hide.
    captureRecoveryRequests({ status: 500 });
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'no-existe@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('login-message').textContent).toMatch(ACKNOWLEDGEMENT)
    );
    const shown = screen.getByTestId('login-message').textContent ?? '';
    expect(shown).not.toContain('User not found');
    expect(shown).not.toContain('Error');
  });

  it('answers identically when the call throws', async () => {
    captureRecoveryRequests({ throws: true });
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('login-message').textContent).toMatch(ACKNOWLEDGEMENT)
    );
    expect(screen.getByTestId('login-message').textContent).not.toContain('network down');
  });

  it('still logs the provider error for operators', async () => {
    captureRecoveryRequests({ status: 500 });
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'no-existe@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        '[Login] password reset request failed:',
        500
      )
    );
  });

  it('posts to the SERVER endpoint, and never to Supabase from the browser', async () => {
    const { resetCalls } = captureRecoveryRequests();
    supabaseHolder.current = buildClient();

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() => expect(resetCalls).toHaveLength(1));
    expect(resetCalls[0].url).toContain('/api/auth/recovery-request');
    // The link is built and sent server-side, so the browser passes nothing but
    // the address — no redirect target a caller could influence.
    expect(Object.keys(JSON.parse(
      (global.fetch as any).mock.calls.find((c: any[]) =>
        String(c[0]).includes('/api/auth/recovery-request')
      )[1].body
    ))).toEqual(['email']);
    // And the browser client has no recovery method left to call.
    expect((supabaseHolder.current.auth as any).resetPasswordForEmail).toBeUndefined();
  });
});
