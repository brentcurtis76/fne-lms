// @vitest-environment jsdom
/**
 * F3 — /change-password always goes through the audited server endpoint.
 *
 * WHAT WAS BROKEN. The page's submit handler was:
 *
 *     const { error } = await supabase.auth.updateUser({ password: newPassword });
 *     if (error && error.status === 422) { …post to /api/auth/force-password-change… }
 *     else if (error) throw error;
 *     await supabase.from('profiles').update({ must_change_password: false })…
 *
 * "Secure password change" is off on this project, so the 422 never arrives and
 * the fallback never fires. The ordinary forced change therefore ran entirely in
 * the browser: no server-side policy check, a flag clear whose failure was
 * logged and ignored, and no `password_change_forced` audit row.
 *
 * F1 removed the other half of the problem: the page's own state reads
 * (`profiles` for the flag, `user_metadata` for the banner) are gone too — the
 * first because the database gate refuses a flagged account's profile read, the
 * second because the caller owns their cookie.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

const { mockRouterPush, supabaseHolder, toastCalls } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  supabaseHolder: { current: null as any },
  toastCalls: { success: [] as string[], error: [] as string[] },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), query: {}, isReady: true }),
}));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('react-hot-toast', () => ({
  toast: {
    success: (m: string) => toastCalls.success.push(m),
    error: (m: string) => toastCalls.error.push(m),
  },
}));

import ChangePasswordPage from '../../pages/change-password';

const USER = '11111111-1111-4111-8111-111111111111';
const STRONG = 'Sintetica2026';

function buildClient() {
  const calls = { profileSelects: [] as unknown[], profileUpdates: [] as unknown[] };

  return {
    calls,
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: USER, user_metadata: { password_reset_by_admin: true } } } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn((cols: unknown) => {
        calls.profileSelects.push({ table, cols });
        return {
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { first_name: 'Ana', last_name: 'Pérez', school: 'Colegio Sintético' },
              error: null,
            })),
          })),
        };
      }),
      update: vi.fn((vals: unknown) => {
        calls.profileUpdates.push({ table, vals });
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    })),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Two endpoints are called: the state probe on mount, the completion on submit. */
function stubFetch(completion: { status: number; body: Record<string, unknown> }) {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('password-change-state')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ mustChangePassword: true, isAdminReset: true }),
      };
    }
    return {
      ok: completion.status >= 200 && completion.status < 300,
      status: completion.status,
      json: async () => completion.body,
    };
  });
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

async function mountForm() {
  const client = buildClient();
  supabaseHolder.current = client;
  render(<ChangePasswordPage />);
  await waitFor(() => {
    expect(screen.getByLabelText('Nueva Contraseña')).toBeInTheDocument();
  });
  return client;
}

function submit(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText('Nueva Contraseña'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirmar Nueva Contraseña'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRouterPush.mockReset();
  toastCalls.success.length = 0;
  toastCalls.error.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  stubFetch({ status: 200, body: { success: true, audited: true } });
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('page state comes from the server', () => {
  it('asks /api/auth/password-change-state instead of reading `profiles`', async () => {
    const client = await mountForm();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/password-change-state', expect.anything());
    // The database gate refuses a flagged account's own profile read, and the
    // banner used to come from `user_metadata` — which the caller owns.
    expect(client.calls.profileSelects).toEqual([]);
  });

  it('renders the administrative-reset banner from the SERVER answer', async () => {
    await mountForm();
    expect(screen.getByText(/El administrador ha restablecido tu contraseña/i)).toBeInTheDocument();
  });

  it('shows the retry panel — never a redirect loop — when the state cannot be read', async () => {
    fetchMock = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    (globalThis as any).fetch = fetchMock;

    supabaseHolder.current = buildClient();
    render(<ChangePasswordPage />);

    await waitFor(() => {
      expect(screen.getByTestId('forced-change-retry')).toBeInTheDocument();
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
  });
});

describe('submission', () => {
  it('posts to the audited endpoint UNCONDITIONALLY — there is no 422 fallback', async () => {
    const client = await mountForm();
    submit(STRONG);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/force-password-change',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // The browser writes neither the password nor the flag.
    expect((client.auth as any).updateUser).toBeUndefined();
    expect(client.calls.profileUpdates).toEqual([]);
  });

  it('reads no `profiles` row after the change — the session is already dead', async () => {
    // The server writes the password through `auth.admin.updateUserById`, and
    // GoTrue revokes the account's refresh tokens when its password changes. The
    // old code's next steps were a `profiles` read and a push to /dashboard;
    // both failed, and the middleware bounced the user to /login anyway. The
    // e2e is what found this.
    const client = await mountForm();
    submit(STRONG);

    await waitFor(() => expect(toastCalls.success.length).toBeGreaterThan(0));
    expect(client.calls.profileSelects).toEqual([]);
  });

  it('signs the dead session out and sends the user to sign in again', async () => {
    const client = await mountForm();
    submit(STRONG);

    await waitFor(() => expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'), { timeout: 4000 });
    // Never the dashboard: there is no session left to render it with.
    expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
  }, 10_000);

  it('rejects a mismatch without calling the server', async () => {
    await mountForm();
    const before = fetchMock.mock.calls.length;
    submit(STRONG, 'Diferente2026');

    await waitFor(() => expect(toastCalls.error.length).toBeGreaterThan(0));
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('rejects a weak password without calling the server; the server checks anyway', async () => {
    await mountForm();
    const before = fetchMock.mock.calls.length;
    submit('abc123');

    await waitFor(() => expect(toastCalls.error.length).toBeGreaterThan(0));
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('surfaces a server rejection instead of reporting success', async () => {
    stubFetch({ status: 400, body: { error: 'La contraseña no cumple con los requisitos de seguridad del sistema' } });
    await mountForm();
    submit(STRONG);

    await waitFor(() => expect(toastCalls.error.length).toBeGreaterThan(0));
    expect(toastCalls.error[0]).toContain('requisitos de seguridad');
    expect(toastCalls.success).toEqual([]);
  });

  it('tells the user plainly when the password changed but the flow did not finish', async () => {
    // The old page reported "exitosamente" in exactly this case and then bounced
    // the user back here with no explanation.
    stubFetch({
      status: 500,
      body: {
        error: 'Tu contraseña se actualizó, pero no pudimos completar el proceso.',
        code: 'FLAG_NOT_CLEARED',
        passwordChanged: true,
      },
    });
    await mountForm();
    submit(STRONG);

    await waitFor(() => expect(toastCalls.error.length).toBeGreaterThan(0));
    expect(toastCalls.error[0]).toContain('no pudimos completar');
    expect(toastCalls.success).toEqual([]);
    expect(mockRouterPush).not.toHaveBeenCalledWith('/dashboard');
  });

  it('on success, says so and says what to do next', async () => {
    await mountForm();
    submit(STRONG);

    await waitFor(() => expect(toastCalls.success.length).toBeGreaterThan(0));
    expect(toastCalls.success[0]).toContain('Contraseña actualizada exitosamente');
    expect(toastCalls.success[0]).toContain('Inicia sesión con tu nueva contraseña');
  });
});
