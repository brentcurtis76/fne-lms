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

function buildClient(opts: { resetError?: { message: string } | null; resetDelayMs?: number } = {}) {
  const resetCalls: Array<{ email: string; options: unknown }> = [];
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: null })),
      resetPasswordForEmail: vi.fn(async (email: string, options: unknown) => {
        resetCalls.push({ email, options });
        if (opts.resetDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, opts.resetDelayMs));
        }
        return { data: null, error: opts.resetError ?? null };
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
      })),
    })),
  };
  return { client, resetCalls };
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
    const { client, resetCalls } = buildClient();
    supabaseHolder.current = client;

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
    const { client, resetCalls } = buildClient();
    supabaseHolder.current = client;

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
    const { client, resetCalls } = buildClient();
    supabaseHolder.current = client;

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

  it('refuses a whitespace-only address without calling Supabase', async () => {
    const { client, resetCalls } = buildClient();
    supabaseHolder.current = client;

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
    const { client, resetCalls } = buildClient({ resetDelayMs: 40 });
    supabaseHolder.current = client;

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
    const { client, resetCalls } = buildClient({ resetDelayMs: 40 });
    supabaseHolder.current = client;

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
    const { client, resetCalls } = buildClient();
    supabaseHolder.current = client;

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
    const { client } = buildClient();
    supabaseHolder.current = client;

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
    const { client } = buildClient({ resetError: { message: 'User not found' } });
    supabaseHolder.current = client;

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
    const client = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
        signInWithPassword: vi.fn(),
        resetPasswordForEmail: vi.fn(async () => {
          throw new Error('network down');
        }),
      },
      from: vi.fn(),
    };
    supabaseHolder.current = client;

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
    const { client } = buildClient({ resetError: { message: 'User not found' } });
    supabaseHolder.current = client;

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
        'User not found'
      )
    );
  });

  it('sends the recovery link back to /reset-password', async () => {
    const { client, resetCalls } = buildClient();
    supabaseHolder.current = client;

    await renderInResetMode();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'persona@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-reset-submit'));
    });

    await waitFor(() => expect(resetCalls).toHaveLength(1));
    expect(resetCalls[0].options).toMatchObject({
      redirectTo: expect.stringContaining('/reset-password'),
    });
  });
});
