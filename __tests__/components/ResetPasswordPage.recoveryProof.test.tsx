// @vitest-environment jsdom
/**
 * S12 — /reset-password: recovery proof, and identity correctness.
 *
 * The page's first action used to be `getSession()`, and ANY session satisfied
 * it. Three consequences, in ascending order of seriousness:
 *
 *   1. A signed-in user who simply navigated to /reset-password got a working
 *      password-change form with no recovery credential at all.
 *   2. A token that failed to verify fell back to "is there a session?", so an
 *      expired or already-used link still produced a usable form.
 *   3. Opening SOMEONE ELSE'S recovery link while signed in: if the token
 *      failed, the page used the session it already had, and the submit changed
 *      the SIGNED-IN account's password rather than the link owner's.
 *
 * Case 3 is the one this suite exists for, and it is asserted twice — once for
 * "the form must not appear" and once for "even if it did, the update must not
 * land on the wrong account".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const { mockRouterPush, supabaseHolder } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  supabaseHolder: { current: null as any },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn(), query: {}, isReady: true }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
}));

import ResetPasswordPage, {
  RECOVERY_MESSAGES,
  hasRecoveryMaterial,
  readRecoveryMaterial,
} from '../../pages/reset-password';

const LINK_OWNER = '11111111-1111-4111-8111-111111111111';
const SIGNED_IN_USER = '99999999-9999-4999-8999-999999999999';
const VALID_PASSWORD = 'Sintetica2026';

interface ClientOptions {
  /** Session present BEFORE any recovery material is consumed. */
  existingSession?: { user: { id: string } } | null;
  /** Session produced by a successful verifyOtp / exchangeCodeForSession. */
  verifiedSession?: { user: { id: string } } | null;
  verifyError?: { message: string } | null;
  exchangeError?: { message: string } | null;
  signOutError?: Error | null;
  updateUserError?: { message: string; code?: string; status?: number } | null;
  profileUpdateError?: { message: string } | null;
  /** Session `getSession()` reports at SUBMIT time, overriding the natural one. */
  sessionAtSubmit?: { user: { id: string } } | null;
}

function buildClient(opts: ClientOptions = {}) {
  let current = opts.existingSession ?? null;
  // `verifiedSession: null` means "verification succeeds but yields no session",
  // which is different from "not specified" — `??` would collapse the two.
  const verified = 'verifiedSession' in opts ? opts.verifiedSession : { user: { id: LINK_OWNER } };
  let consumed = false;
  const calls = {
    signOut: 0,
    verifyOtp: [] as unknown[],
    exchangeCode: [] as unknown[],
    updateUser: [] as unknown[],
    profileUpdates: [] as unknown[],
    profileEq: [] as unknown[],
  };
  let authListener: ((event: string, session: unknown) => void) | null = null;

  const client = {
    auth: {
      getSession: vi.fn(async () => {
        if (consumed && opts.sessionAtSubmit !== undefined) {
          return { data: { session: opts.sessionAtSubmit } };
        }
        return { data: { session: current } };
      }),
      signOut: vi.fn(async () => {
        calls.signOut += 1;
        if (opts.signOutError) throw opts.signOutError;
        current = null;
        return { error: null };
      }),
      verifyOtp: vi.fn(async (params: unknown) => {
        calls.verifyOtp.push(params);
        if (opts.verifyError) return { data: null, error: opts.verifyError };
        current = verified ?? null;
        consumed = true;
        return { data: { session: verified }, error: null };
      }),
      exchangeCodeForSession: vi.fn(async (code: unknown) => {
        calls.exchangeCode.push(code);
        if (opts.exchangeError) return { data: null, error: opts.exchangeError };
        current = verified ?? null;
        consumed = true;
        return { data: { session: verified }, error: null };
      }),
      updateUser: vi.fn(async (payload: unknown) => {
        calls.updateUser.push(payload);
        return { data: null, error: opts.updateUserError ?? null };
      }),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn(() => ({
      update: vi.fn((payload: unknown) => {
        calls.profileUpdates.push(payload);
        return {
          eq: vi.fn(async (col: string, val: unknown) => {
            calls.profileEq.push({ col, val });
            return { error: opts.profileUpdateError ?? null };
          }),
        };
      }),
    })),
  };

  return {
    client,
    calls,
    emit: (event: string, session: unknown) => authListener?.(event, session),
    setSession: (session: { user: { id: string } } | null) => {
      current = session;
    },
  };
}

function setUrl(search: string, hash = '') {
  window.history.replaceState({}, '', `/reset-password${search}${hash}`);
}

async function renderPage() {
  const result = render(<ResetPasswordPage />);
  // Let the mount effect settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  setUrl('');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The pure URL reader
// ---------------------------------------------------------------------------

describe('readRecoveryMaterial', () => {
  it('reads token_hash, code and a raw token from the query', () => {
    expect(readRecoveryMaterial('?token_hash=abc', '')).toMatchObject({ tokenHash: 'abc' });
    expect(readRecoveryMaterial('?code=xyz', '')).toMatchObject({ code: 'xyz' });
    expect(readRecoveryMaterial('?token=raw', '')).toMatchObject({ rawToken: 'raw' });
  });

  it('recognises the legacy implicit fragment', () => {
    expect(
      readRecoveryMaterial('', '#access_token=aaa&type=recovery').hashRecovery
    ).toBe(true);
  });

  it('does not accept type=recovery WITHOUT an access token — nothing to consume', () => {
    expect(readRecoveryMaterial('', '#type=recovery').hashRecovery).toBe(false);
  });

  it('does not accept a non-recovery fragment', () => {
    expect(
      readRecoveryMaterial('', '#access_token=aaa&type=signup').hashRecovery
    ).toBe(false);
  });

  it('an empty URL carries no material', () => {
    expect(hasRecoveryMaterial(readRecoveryMaterial('', ''))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE defect: a session is not recovery proof
// ---------------------------------------------------------------------------

describe('a bare visit never produces a usable form', () => {
  it('signed OUT, no recovery material → invalid-link screen', async () => {
    const { client } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('');

    await renderPage();

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
  });

  it('SIGNED IN, no recovery material → invalid-link screen, not a form', async () => {
    // The whole S12 defect in one test. The old page called getSession() first
    // and treated any session as proof, so this rendered a working form.
    const { client, calls } = buildClient({
      existingSession: { user: { id: SIGNED_IN_USER } },
    });
    supabaseHolder.current = client;
    setUrl('');

    await renderPage();

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('reset-invalid-link').textContent).toContain('Enlace no válido');
    // It did not even ask whether a session existed — the answer is irrelevant.
    expect(client.auth.getSession).not.toHaveBeenCalled();
    expect(calls.verifyOtp).toEqual([]);
  });

  it('a plain SIGNED_IN auth event is not accepted as recovery proof', async () => {
    const { client, emit } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('');

    await renderPage();

    await act(async () => {
      emit('SIGNED_IN', { user: { id: SIGNED_IN_USER } });
    });

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
  });

  it('offers a way back to sign-in rather than a dead end', async () => {
    const { client } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('');

    await renderPage();
    fireEvent.click(screen.getByTestId('reset-invalid-back-to-login'));
    expect(mockRouterPush).toHaveBeenCalledWith('/login');
  });
});

// ---------------------------------------------------------------------------
// React Strict Mode
// ---------------------------------------------------------------------------

describe('React Strict Mode (next.config.js sets reactStrictMode: true)', () => {
  it('consumes a one-time token EXACTLY once and still reaches the form', async () => {
    // Strict Mode invokes an effect, runs its cleanup, and invokes it again.
    // Two failure modes have to be excluded at once:
    //   - verifying twice would BURN a one-time token and report "expired" for a
    //     link that was perfectly valid;
    //   - guarding the second invocation with a ref while the cleanup cancels the
    //     first leaves the page on "Validando enlace..." forever. That is exactly
    //     what an earlier shape of this effect did, and only a run through the
    //     dev server surfaced it — the CI e2e serves a production build, where
    //     Strict Mode does not double-invoke.
    const { client, calls } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('?token_hash=valid-hash');

    render(
      <React.StrictMode>
        <ResetPasswordPage />
      </React.StrictMode>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls.verifyOtp).toHaveLength(1);
    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-validating')).not.toBeInTheDocument();
  });

  it('still reaches the invalid screen for a bare visit', async () => {
    const { client } = buildClient({ existingSession: { user: { id: SIGNED_IN_USER } } });
    supabaseHolder.current = client;
    setUrl('');

    render(
      <React.StrictMode>
        <ResetPasswordPage />
      </React.StrictMode>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Consuming real recovery material
// ---------------------------------------------------------------------------

describe('token_hash (verifyOtp)', () => {
  it('a valid token_hash enables the form', async () => {
    const { client, calls } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('?token_hash=valid-hash');

    await renderPage();

    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    expect(calls.verifyOtp).toEqual([{ token_hash: 'valid-hash', type: 'recovery' }]);
  });

  it('an expired token_hash shows the invalid screen — no form', async () => {
    const { client } = buildClient({
      existingSession: null,
      verifyError: { message: 'Token has expired or is invalid' },
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=expired-hash');

    await renderPage();

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.getByTestId('reset-invalid-link').textContent).toContain('ya expiró');
  });

  it('a REUSED token_hash shows the invalid screen', async () => {
    // GoTrue answers a second use of a one-time token the same way it answers
    // an expired one; the page must not distinguish them into a usable form.
    const { client } = buildClient({
      existingSession: null,
      verifyError: { message: 'Token has expired or is invalid' },
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=already-used');

    await renderPage();
    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
  });

  it('a token that verifies but yields no session is refused', async () => {
    const { client } = buildClient({ existingSession: null, verifiedSession: null });
    supabaseHolder.current = client;
    setUrl('?token_hash=no-session');

    await renderPage();
    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
  });

  it('strips the token from the URL only AFTER consuming it', async () => {
    const { client, calls } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('?token_hash=valid-hash');

    await renderPage();

    // Consumed with the real value…
    expect(calls.verifyOtp).toEqual([{ token_hash: 'valid-hash', type: 'recovery' }]);
    // …and only then removed from the address bar.
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/reset-password');
  });
});

describe('PKCE code (exchangeCodeForSession)', () => {
  it('a valid code enables the form', async () => {
    const { client, calls } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('?code=valid-code');

    await renderPage();

    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    expect(calls.exchangeCode).toEqual(['valid-code']);
  });

  it('a failed exchange shows the invalid screen', async () => {
    const { client } = buildClient({
      existingSession: null,
      exchangeError: { message: 'invalid request: both auth code and code verifier should be non-empty' },
    });
    supabaseHolder.current = client;
    setUrl('?code=bad-code');

    await renderPage();
    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
  });

  it('strips the code from the URL after the exchange', async () => {
    const { client } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('?code=valid-code');

    await renderPage();
    expect(window.location.search).toBe('');
  });
});

describe('legacy hash fragment', () => {
  it('a PASSWORD_RECOVERY event enables the form', async () => {
    const { client, emit } = buildClient({ existingSession: null });
    supabaseHolder.current = client;
    setUrl('', '#access_token=aaa&type=recovery');

    render(<ResetPasswordPage />);
    await act(async () => {
      emit('PASSWORD_RECOVERY', { user: { id: LINK_OWNER } });
      await Promise.resolve();
    });

    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
  });
});

describe('a raw {{ .Token }} link', () => {
  it('is refused with a specific message rather than falling through', async () => {
    const { client } = buildClient({ existingSession: { user: { id: SIGNED_IN_USER } } });
    supabaseHolder.current = client;
    setUrl('?token=raw-token-value');

    await renderPage();

    expect(screen.getByTestId('reset-invalid-link').textContent).toContain(
      'no contiene la información necesaria'
    );
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Identity correctness — the case that could change the wrong password
// ---------------------------------------------------------------------------

describe('identity correctness', () => {
  it("opening ANOTHER account's EXPIRED link while signed in shows no form", async () => {
    // The old page: verifyOtp fails, the handler falls back to getSession(),
    // finds the signed-in session, and renders a working form. Submitting it
    // changed the SIGNED-IN user's password.
    const { client, calls } = buildClient({
      existingSession: { user: { id: SIGNED_IN_USER } },
      verifyError: { message: 'Token has expired or is invalid' },
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=someone-elses-expired-token');

    await renderPage();

    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
    // And the pre-existing session was discarded BEFORE the attempt, so there
    // was nothing left to fall back onto even if a later branch tried.
    expect(calls.signOut).toBe(1);
  });

  it("opening ANOTHER account's VALID link while signed in acts on the LINK's owner", async () => {
    const { client, calls } = buildClient({
      existingSession: { user: { id: SIGNED_IN_USER } },
      verifiedSession: { user: { id: LINK_OWNER } },
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=someone-elses-valid-token');

    await renderPage();

    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    expect(calls.signOut).toBe(1);

    fireEvent.change(screen.getByTestId('reset-new-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), {
      target: { value: VALID_PASSWORD },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() => expect(calls.updateUser).toHaveLength(1));
    // The forced-change flag is cleared for the LINK's owner, not the account
    // that happened to be signed in.
    expect(calls.profileEq).toEqual([{ col: 'id', val: LINK_OWNER }]);
  });

  it('refuses the update if the session identity changes after verification', async () => {
    // Defence in depth for a session swapped underneath the form — a second
    // tab, a background refresh, a race. The update must not land on it.
    const { client, calls } = buildClient({
      existingSession: null,
      verifiedSession: { user: { id: LINK_OWNER } },
      sessionAtSubmit: { user: { id: SIGNED_IN_USER } },
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=valid-hash');

    await renderPage();
    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('reset-new-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), {
      target: { value: VALID_PASSWORD },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument());
    expect(calls.updateUser).toEqual([]);
    expect(screen.getByTestId('reset-invalid-link').textContent).toContain(
      'no se actualizó ninguna contraseña'
    );
  });

  it('refuses the update if the recovery session is gone by submit time', async () => {
    const { client, calls } = buildClient({
      existingSession: null,
      verifiedSession: { user: { id: LINK_OWNER } },
      sessionAtSubmit: null,
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=valid-hash');

    await renderPage();
    fireEvent.change(screen.getByTestId('reset-new-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), {
      target: { value: VALID_PASSWORD },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument());
    expect(calls.updateUser).toEqual([]);
  });

  it('a failed sign-out aborts recovery rather than continuing on the old session', async () => {
    const { client } = buildClient({
      existingSession: { user: { id: SIGNED_IN_USER } },
      signOutError: new Error('network'),
    });
    supabaseHolder.current = client;
    setUrl('?token_hash=valid-hash');

    await renderPage();
    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The form itself
// ---------------------------------------------------------------------------

describe('the password form', () => {
  async function readyForm(opts: ClientOptions = {}) {
    const built = buildClient({ existingSession: null, ...opts });
    supabaseHolder.current = built.client;
    setUrl('?token_hash=valid-hash');
    await renderPage();
    return built;
  }

  it('enforces the SHARED policy, not six characters', async () => {
    const { calls } = await readyForm();

    // The exact shape the old page accepted.
    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: 'abc123' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    expect(calls.updateUser).toEqual([]);
    expect(screen.getByTestId('reset-message').textContent).toMatch(/^La contraseña/);
  });

  it('requires the two fields to match', async () => {
    const { calls } = await readyForm();

    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: 'Otra2026x' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    expect(calls.updateUser).toEqual([]);
    expect(screen.getByTestId('reset-message').textContent).toContain(RECOVERY_MESSAGES.mismatch);
  });

  it('updates the password and clears the forced-change flag', async () => {
    const { calls } = await readyForm();

    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: VALID_PASSWORD } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() => expect(calls.updateUser).toEqual([{ password: VALID_PASSWORD }]));
    expect(calls.profileUpdates).toEqual([{ must_change_password: false }]);
    expect(screen.getByTestId('reset-message').textContent).toContain(RECOVERY_MESSAGES.success);
  });

  it('surfaces GoTrue 422 as a security-requirements message', async () => {
    // GoTrue applies its own minimum length and, when leaked-password
    // protection is enabled, a HaveIBeenPwned check. Those are dashboard
    // settings the application does not own, so its refusal must reach the user
    // rather than being swallowed into a generic failure.
    await readyForm({ updateUserError: { message: 'Password is known to be weak', status: 422 } });

    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: VALID_PASSWORD } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('reset-message').textContent).toContain(RECOVERY_MESSAGES.weak)
    );
  });

  it('surfaces "same password" specifically', async () => {
    await readyForm({
      updateUserError: { message: 'New password should be different from the old password', code: 'same_password' },
    });

    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: VALID_PASSWORD } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('reset-message').textContent).toContain(RECOVERY_MESSAGES.samePassword)
    );
  });

  it('still reports success when only the profile flag write fails', async () => {
    // The password IS changed at that point; telling the user it failed would
    // send them round the recovery loop for nothing.
    const { calls } = await readyForm({ profileUpdateError: { message: 'rls denied' } });

    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: VALID_PASSWORD } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: VALID_PASSWORD } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reset-submit'));
    });

    await waitFor(() => expect(calls.updateUser).toHaveLength(1));
    expect(screen.getByTestId('reset-message').textContent).toContain(RECOVERY_MESSAGES.success);
  });

  it('every user-facing message is es-CL', () => {
    for (const message of Object.values(RECOVERY_MESSAGES)) {
      expect(message).not.toMatch(/\b(error|invalid|expired|password)\b/i);
    }
  });
});
