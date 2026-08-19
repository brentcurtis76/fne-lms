// @vitest-environment jsdom
/**
 * /reset-password — recovery proof, identity correctness, and the initialisation
 * race.
 *
 * ROUND ONE (S12) fixed the headline defect: the page's first action was
 * `getSession()`, and ANY session satisfied it, so a signed-in visitor got a
 * working form with no credential and a failed token fell back onto the session
 * that was already there.
 *
 * ROUND TWO (F2) is what this suite is now mostly about — the holes the first
 * fix left, every one of which is reachable from an address bar:
 *
 *   1. THE LEGACY FRAGMENT BRANCH NEVER SIGNED OUT and never verified anything.
 *      Its admission ticket was "the fragment contains the strings
 *      `type=recovery` and `access_token`", and it then POLLED `getSession()` —
 *      which, for a signed-in visitor, answers immediately with their own live
 *      session. Typing `#access_token=x&type=recovery` was enough to open the
 *      form on your own account. Supabase makes it worse: failed implicit
 *      processing LEAVES the previous session in place.
 *
 *   2. `signOut()`'s RETURN VALUE was ignored. supabase-js reports failure as
 *      `{ error }` rather than throwing, so the try/catch around it caught
 *      nothing and a failed sign-out continued into consumption.
 *
 *   3. THE PASSWORD WAS WRITTEN BY THE BROWSER, with no server-side policy
 *      check, a best-effort flag clear whose failure was reported as success,
 *      and no audit row of any kind.
 *
 * Every case below is written from the attacker's side: what can a signed-in
 * visitor put in the URL, and does the form appear.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
const OWNER_TOKEN = 'access-token-belonging-to-the-link-owner';
const INTRUDER_TOKEN = 'access-token-belonging-to-the-signed-in-visitor';

interface ClientOptions {
  /** A session that already exists BEFORE any material is consumed. */
  existingSession?: { user: { id: string }; access_token: string } | null;
  /** What a successful consumption yields. */
  verifiedSession?: { user: { id: string }; access_token: string } | null;
  verifyError?: { message: string } | null;
  exchangeError?: { message: string } | null;
  setSessionError?: { message: string } | null;
  /** supabase-js reports sign-out failure as `{ error }` — it does not throw. */
  signOutError?: { message: string } | null;
  /** Make signOut throw instead, for the other half of the contract. */
  signOutThrows?: boolean;
  /** What `getUser(token)` says. Defaults to the link owner. */
  getUserResult?: { data: { user: { id: string } | null }; error: unknown };
}

function buildClient(opts: ClientOptions = {}) {
  let current = opts.existingSession ?? null;
  const verified =
    'verifiedSession' in opts
      ? opts.verifiedSession
      : { user: { id: LINK_OWNER }, access_token: OWNER_TOKEN };

  const calls = {
    signOut: [] as unknown[],
    verifyOtp: [] as unknown[],
    exchangeCode: [] as unknown[],
    setSession: [] as unknown[],
    getUser: [] as unknown[],
    getSession: 0,
  };

  const client = {
    auth: {
      // Present so a regression that reintroduces a session read is VISIBLE
      // rather than crashing the test for the wrong reason. Its call count is
      // asserted to be zero.
      getSession: vi.fn(async () => {
        calls.getSession += 1;
        return { data: { session: current } };
      }),
      signOut: vi.fn(async (params: unknown) => {
        calls.signOut.push(params);
        if (opts.signOutThrows) throw new Error('network down');
        if (opts.signOutError) return { error: opts.signOutError };
        current = null;
        return { error: null };
      }),
      verifyOtp: vi.fn(async (params: unknown) => {
        calls.verifyOtp.push(params);
        if (opts.verifyError) return { data: null, error: opts.verifyError };
        current = verified ?? null;
        return { data: { session: verified }, error: null };
      }),
      exchangeCodeForSession: vi.fn(async (code: unknown) => {
        calls.exchangeCode.push(code);
        if (opts.exchangeError) return { data: null, error: opts.exchangeError };
        current = verified ?? null;
        return { data: { session: verified }, error: null };
      }),
      setSession: vi.fn(async (params: unknown) => {
        calls.setSession.push(params);
        if (opts.setSessionError) return { data: null, error: opts.setSessionError };
        current = verified ?? null;
        return { data: { session: verified }, error: null };
      }),
      getUser: vi.fn(async (token: unknown) => {
        calls.getUser.push(token);
        if (opts.getUserResult) return opts.getUserResult;
        return { data: { user: { id: LINK_OWNER } }, error: null };
      }),
    },
    calls,
  };

  return client;
}

/** Put the browser at a URL, exactly as a click from an e-mail would. */
function visit(url: string) {
  window.history.replaceState({}, '', url);
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(response: { status: number; body: Record<string, unknown> }) {
  fetchMock = vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  }));
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

async function mount(opts: ClientOptions = {}) {
  const client = buildClient(opts);
  supabaseHolder.current = client;
  render(<ResetPasswordPage />);
  return client;
}

const formVisible = () => screen.queryByTestId('reset-password-form') !== null;

async function expectInvalid(message?: string) {
  await waitFor(() => {
    expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
  });
  expect(formVisible()).toBe(false);
  if (message) {
    expect(screen.getByTestId('reset-invalid-link')).toHaveTextContent(message);
  }
}

async function expectForm() {
  await waitFor(() => {
    expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRouterPush.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  visit('/reset-password');
  stubFetch({ status: 200, body: { success: true, message: RECOVERY_MESSAGES.success } });
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

// ---------------------------------------------------------------------------
// The pure reader
// ---------------------------------------------------------------------------

describe('readRecoveryMaterial', () => {
  it('reads a token_hash link — the format this application sends', () => {
    const m = readRecoveryMaterial('?token_hash=abc&type=recovery', '');
    expect(m.tokenHash).toBe('abc');
    expect(m.type).toBe('recovery');
    expect(hasRecoveryMaterial(m)).toBe(true);
  });

  it('reads a PKCE code', () => {
    const m = readRecoveryMaterial('?code=xyz', '');
    expect(m.code).toBe('xyz');
    expect(hasRecoveryMaterial(m)).toBe(true);
  });

  it('admits a legacy implicit fragment ONLY when all three parts are present', () => {
    const complete = readRecoveryMaterial(
      '',
      '#access_token=a&refresh_token=r&type=recovery&expires_in=3600'
    );
    expect(complete.implicit).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(complete.implicitIncomplete).toBe(false);
  });

  it.each([
    ['no refresh token', '#access_token=a&type=recovery'],
    ['no access token', '#refresh_token=r&type=recovery'],
    ['no type', '#access_token=a&refresh_token=r'],
    ['the wrong type', '#access_token=a&refresh_token=r&type=signup'],
    ['nothing but the word recovery', '#type=recovery'],
  ])('refuses an implicit fragment with %s', (_label, hash) => {
    const m = readRecoveryMaterial('', hash);
    expect(m.implicit).toBeNull();
    expect(m.implicitIncomplete).toBe(true);
    // It still counts as "material" so the page REFUSES it rather than
    // reporting "no link" and falling through to some other branch.
    expect(hasRecoveryMaterial(m)).toBe(true);
  });

  it('reports an empty URL as carrying nothing', () => {
    const m = readRecoveryMaterial('', '');
    expect(hasRecoveryMaterial(m)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A session is never proof
// ---------------------------------------------------------------------------

describe('a plain session is not recovery proof', () => {
  it('bare /reset-password with a live session shows the invalid screen', async () => {
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
    });

    await expectInvalid(RECOVERY_MESSAGES.missing);
    // Nothing was consumed and nothing was verified — there was nothing to
    // consume. The old page called getSession() here and accepted the answer.
    expect(client.calls.verifyOtp).toEqual([]);
    expect(client.calls.getUser).toEqual([]);
    expect(client.calls.getSession).toBe(0);
  });

  it('never consults getSession() on ANY path, valid or not', async () => {
    visit('/reset-password?token_hash=good&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
    });

    await expectForm();
    expect(client.calls.getSession).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The forged fragment — the hole round one left open
// ---------------------------------------------------------------------------

describe('a signed-in visitor with a forged fragment', () => {
  it('gets NO form for a hand-typed #access_token&type=recovery', async () => {
    // This is the exact string an attacker types. Round one admitted it on the
    // presence of the two words and then polled getSession(), which answered
    // with the visitor's own live session.
    visit('/reset-password#access_token=forged&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
    });

    await expectInvalid();
    expect(client.calls.setSession).toEqual([]);
    expect(client.calls.getSession).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gets NO form when the complete-looking fragment fails to establish', async () => {
    // Supabase LEAVES the existing session in place when implicit processing
    // fails. The page must not read that as success.
    visit('/reset-password#access_token=stale&refresh_token=stale&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
      setSessionError: { message: 'invalid refresh token' },
    });

    await expectInvalid(RECOVERY_MESSAGES.expired);
    expect(client.calls.setSession).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gets NO form when the fragment establishes a session the auth server rejects', async () => {
    visit('/reset-password#access_token=a&refresh_token=r&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
      getUserResult: { data: { user: null }, error: { message: 'token expired' } },
    });

    await expectInvalid(RECOVERY_MESSAGES.expired);
    expect(client.calls.getUser).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs the existing session out BEFORE touching the fragment', async () => {
    visit('/reset-password#access_token=a&refresh_token=r&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
    });

    await expectForm();
    // Round one applied the sign-out to token_hash and code only. The implicit
    // branch — the one an attacker can type — went straight through.
    expect(client.calls.signOut).toHaveLength(1);
    expect(client.calls.signOut[0]).toEqual({ scope: 'local' });
  });
});

// ---------------------------------------------------------------------------
// Expired, reused, and wrong-type links
// ---------------------------------------------------------------------------

describe('links that do not verify', () => {
  it('an expired token_hash shows the invalid screen, not the form', async () => {
    visit('/reset-password?token_hash=expired&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
      verifyError: { message: 'Token has expired or is invalid' },
    });

    await expectInvalid(RECOVERY_MESSAGES.expired);
    // The pre-existing session is gone, so there is nothing left to fall back
    // onto. That is what makes "someone else's expired link changes YOUR
    // password" structurally impossible rather than merely unlikely.
    expect(client.calls.signOut).toHaveLength(1);
    expect(client.calls.getSession).toBe(0);
  });

  it('a reused token_hash (verifies, but yields no session) shows the invalid screen', async () => {
    visit('/reset-password?token_hash=already-used&type=recovery');
    await mount({ verifiedSession: null });
    await expectInvalid(RECOVERY_MESSAGES.expired);
  });

  it('a failed PKCE exchange shows the invalid screen', async () => {
    visit('/reset-password?code=dead');
    await mount({ exchangeError: { message: 'invalid grant' } });
    await expectInvalid(RECOVERY_MESSAGES.expired);
  });

  it('a raw {{ .Token }} link says so plainly instead of falling through', async () => {
    visit('/reset-password?token=123456&type=recovery');
    await mount();
    await expectInvalid(RECOVERY_MESSAGES.rawToken);
  });

  it('a non-recovery type is refused rather than verified as recovery', async () => {
    visit('/reset-password?token_hash=abc&type=email_change');
    const client = await mount();
    await expectInvalid(RECOVERY_MESSAGES.wrongType);
    expect(client.calls.verifyOtp).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The sign-out contract — supabase-js returns `{ error }`, it does not throw
// ---------------------------------------------------------------------------

describe('sign-out failure', () => {
  it('a RETURNED {error} stops the flow — the shape supabase-js actually uses', async () => {
    // Round one wrapped signOut in try/catch. supabase-js does not throw; it
    // returns `{ error }`. So the catch caught nothing and a failed sign-out
    // continued into consumption with the old session intact.
    visit('/reset-password?token_hash=good&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
      signOutError: { message: 'could not reach the auth server' },
    });

    await expectInvalid(RECOVERY_MESSAGES.signOutFailed);
    expect(client.calls.verifyOtp).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a THROWN error stops the flow too', async () => {
    visit('/reset-password?token_hash=good&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
      signOutThrows: true,
    });

    await expectInvalid(RECOVERY_MESSAGES.signOutFailed);
    expect(client.calls.verifyOtp).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Valid links
// ---------------------------------------------------------------------------

describe('valid recovery links', () => {
  it('the invitation format the server produces opens the form', async () => {
    // lib/auth/recovery-link.ts builds exactly this from
    // generateLink().properties.hashed_token, and the mandatory e2e opens the
    // string that was placed in the message.
    visit('/reset-password?token_hash=hashed-token-from-generate-link&type=recovery');
    const client = await mount();

    await expectForm();
    expect(client.calls.verifyOtp).toEqual([
      { token_hash: 'hashed-token-from-generate-link', type: 'recovery' },
    ]);
    expect(client.calls.getUser).toEqual([OWNER_TOKEN]);
  });

  it('a self-service PKCE recovery link opens the form', async () => {
    visit('/reset-password?code=pkce-code');
    const client = await mount();

    await expectForm();
    expect(client.calls.exchangeCode).toEqual(['pkce-code']);
    expect(client.calls.getUser).toEqual([OWNER_TOKEN]);
  });

  it('a complete legacy implicit link opens the form, having verified it', async () => {
    visit('/reset-password#access_token=a&refresh_token=r&type=recovery');
    const client = await mount();

    await expectForm();
    expect(client.calls.setSession).toEqual([{ access_token: 'a', refresh_token: 'r' }]);
    expect(client.calls.getUser).toEqual([OWNER_TOKEN]);
  });

  it('strips the URL only AFTER the material has been captured and used', async () => {
    visit('/reset-password?token_hash=good&type=recovery');
    const client = await mount();

    await expectForm();
    // Captured: verification happened with the real token.
    expect(client.calls.verifyOtp).toEqual([{ token_hash: 'good', type: 'recovery' }]);
    // Then stripped.
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('consumes the one-time credential EXACTLY once across a Strict Mode double-invoke', async () => {
    visit('/reset-password?token_hash=one-time&type=recovery');
    const client = buildClient();
    supabaseHolder.current = client;

    render(
      <React.StrictMode>
        <ResetPasswordPage />
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
    });
    // A second verifyOtp would burn the token and report "expired" for a link
    // that was perfectly valid.
    expect(client.calls.verifyOtp).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Submission — the server does the writing
// ---------------------------------------------------------------------------

describe('completing the change', () => {
  async function openForm(opts: ClientOptions = {}) {
    visit('/reset-password?token_hash=good&type=recovery');
    const client = await mount(opts);
    await expectForm();
    return client;
  }

  function submit(password: string, confirm = password) {
    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: password } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: confirm } });
    fireEvent.click(screen.getByTestId('reset-submit'));
  }

  it('never calls auth.updateUser — the browser does not write passwords', async () => {
    const client = await openForm();
    submit(VALID_PASSWORD);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((client.auth as any).updateUser).toBeUndefined();
  });

  it('posts the VERIFIED token as a bearer credential, and no user id', async () => {
    await openForm();
    submit(VALID_PASSWORD);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('/api/auth/recovery-complete');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${OWNER_TOKEN}`);

    // The account is named by the token, not by the request. There is no field
    // here that could redirect the write onto a third account.
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ newPassword: VALID_PASSWORD });
    expect(JSON.stringify(body)).not.toContain(LINK_OWNER);
    expect(JSON.stringify(body)).not.toContain(SIGNED_IN_USER);
  });

  it('a signed-in visitor opening ANOTHER account link acts only on the link owner', async () => {
    // The visitor's own session is signed out before consumption, and the
    // bearer token the submit carries is the one the LINK produced.
    visit('/reset-password?token_hash=owners-link&type=recovery');
    const client = await mount({
      existingSession: { user: { id: SIGNED_IN_USER }, access_token: INTRUDER_TOKEN },
    });
    await expectForm();
    submit(VALID_PASSWORD);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${OWNER_TOKEN}`);
    expect((init.headers as Record<string, string>).Authorization).not.toContain(INTRUDER_TOKEN);
    expect(client.calls.signOut.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a mismatch client-side without calling the server', async () => {
    await openForm();
    submit(VALID_PASSWORD, 'Diferente2026');

    await waitFor(() => {
      expect(screen.getByTestId('reset-message')).toHaveTextContent(RECOVERY_MESSAGES.mismatch);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a weak password client-side; the server checks it again anyway', async () => {
    await openForm();
    submit('abc123');

    await waitFor(() => expect(screen.getByTestId('reset-message')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server message on a policy rejection', async () => {
    stubFetch({
      status: 400,
      body: { error: 'La contraseña no cumple con los requisitos de seguridad del sistema', code: 'PASSWORD_POLICY' },
    });
    await openForm();
    submit(VALID_PASSWORD);

    await waitFor(() => {
      expect(screen.getByTestId('reset-message')).toHaveTextContent(
        'no cumple con los requisitos'
      );
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('a rejected recovery token sends the user back to the invalid screen', async () => {
    stubFetch({ status: 401, body: { error: 'x', code: 'RECOVERY_TOKEN_INVALID' } });
    await openForm();
    submit(VALID_PASSWORD);

    await waitFor(() => {
      expect(screen.getByTestId('reset-invalid-link')).toBeInTheDocument();
    });
  });

  it('does NOT report success when the server reports a partial failure', async () => {
    // The password changed but the forced-change flag did not clear. The old
    // page said "exitosamente" in exactly this case and then bounced the user
    // back to /change-password with no explanation.
    stubFetch({
      status: 500,
      body: {
        error: 'Tu contraseña se actualizó, pero no pudimos completar el proceso.',
        code: 'FLAG_NOT_CLEARED',
        passwordChanged: true,
      },
    });
    await openForm();
    submit(VALID_PASSWORD);

    await waitFor(() => {
      expect(screen.getByTestId('reset-message')).toHaveTextContent('no pudimos completar');
    });
    expect(screen.queryByTestId('reset-message')).not.toHaveTextContent(
      RECOVERY_MESSAGES.success
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('on success, reports it and sends the user to sign in with the new password', async () => {
    await openForm();
    submit(VALID_PASSWORD);

    await waitFor(() => {
      expect(screen.getByTestId('reset-message')).toHaveTextContent(RECOVERY_MESSAGES.success);
    });

    // The page waits ~2s so the confirmation is readable, then sends the user to
    // sign in WITH THE NEW PASSWORD rather than into a dashboard on a recovery
    // session.
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/login'), {
      timeout: 4000,
    });
  }, 10_000);

  it('never writes to `profiles` from the browser', async () => {
    const client = await openForm();
    submit(VALID_PASSWORD);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // There is no `from` on this client at all: if the page tried, it would
    // throw rather than silently fail the way the old flag write did.
    expect((client as any).from).toBeUndefined();
  });
});
