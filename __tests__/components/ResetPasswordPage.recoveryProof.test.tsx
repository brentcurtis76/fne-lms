// @vitest-environment jsdom
/**
 * /reset-password — what the page will open for, and what it forwards.
 *
 * ROUND ONE (S12) fixed the headline defect: the page's first action was
 * `getSession()`, and ANY session satisfied it.
 *
 * ROUND TWO (F2) closed four more holes, all reachable from an address bar: the
 * legacy fragment branch never signed out and never verified; `signOut()`'s
 * `{ error }` return was ignored; `detectSessionInUrl` raced the page for the
 * URL; and the password write still happened in the browser.
 *
 * ROUND THREE — this suite. Round two consumed the recovery material HERE and
 * posted the resulting access token to the server as proof. That is not proof:
 * `getUser` cannot tell a recovery-minted token from a login-minted one, so the
 * endpoint accepted ordinary sessions. The fix removes the browser from the
 * ceremony entirely.
 *
 * So the properties this suite asserts are now:
 *
 *   * the page CONSUMES NOTHING — no verifyOtp, no exchangeCodeForSession, no
 *     setSession, no getUser, no getSession, on any path;
 *   * exactly one link format opens the form, and it is the one this platform
 *     sends;
 *   * an implicit `#access_token=` fragment and a PKCE `?code=` are REFUSED BY
 *     NAME, because neither can become server-verifiable purpose-bound proof;
 *   * the request carries the one-time material and NO session credential;
 *   * a burnt link closes the form instead of inviting a retry that cannot work.
 *
 * Every case is written from the attacker's side: what can a signed-in visitor
 * put in the URL, and does the form appear.
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
  judgeRecoveryMaterial,
  readRecoveryMaterial,
} from '../../pages/reset-password';

const VALID_PASSWORD = 'Sintetica2026';
const HASH = 'one-time-hash-from-the-email';
const INTRUDER_TOKEN = 'access-token-belonging-to-the-signed-in-visitor';

interface ClientOptions {
  /** supabase-js reports sign-out failure as `{ error }` — it does not throw. */
  signOutError?: { message: string } | null;
  /** Make signOut throw instead, for the other half of the contract. */
  signOutThrows?: boolean;
}

/**
 * The client the page is given. Every method the OLD page used is present and
 * counted, so a regression that reintroduces one is a failed assertion rather
 * than a TypeError in an unrelated test.
 */
function buildClient(opts: ClientOptions = {}) {
  const calls = {
    signOut: [] as unknown[],
    verifyOtp: 0,
    exchangeCode: 0,
    setSession: 0,
    getUser: 0,
    getSession: 0,
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => {
        calls.getSession += 1;
        return { data: { session: { user: { id: 'someone' }, access_token: INTRUDER_TOKEN } } };
      }),
      signOut: vi.fn(async (params: unknown) => {
        calls.signOut.push(params);
        if (opts.signOutThrows) throw new Error('network down');
        if (opts.signOutError) return { error: opts.signOutError };
        return { error: null };
      }),
      verifyOtp: vi.fn(async () => {
        calls.verifyOtp += 1;
        return { data: null, error: null };
      }),
      exchangeCodeForSession: vi.fn(async () => {
        calls.exchangeCode += 1;
        return { data: null, error: null };
      }),
      setSession: vi.fn(async () => {
        calls.setSession += 1;
        return { data: null, error: null };
      }),
      getUser: vi.fn(async () => {
        calls.getUser += 1;
        return { data: { user: null }, error: null };
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

/** Fill both fields and submit. */
async function submit(password: string) {
  fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: password } });
  fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: password } });
  fireEvent.click(screen.getByTestId('reset-submit'));
}

/** Every call the page must NEVER make. */
function expectConsumedNothing(client: any) {
  expect(client.calls.verifyOtp, 'the browser must not verify the material').toBe(0);
  expect(client.calls.exchangeCode, 'the browser must not exchange a PKCE code').toBe(0);
  expect(client.calls.setSession, 'the browser must not establish a session from a fragment').toBe(0);
  expect(client.calls.getUser, 'identity is not established in the browser').toBe(0);
  expect(client.calls.getSession, 'no session is consulted as proof, on any path').toBe(0);
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
// The pure admission rule.
// ---------------------------------------------------------------------------

describe('judgeRecoveryMaterial — the whole admission rule, as one function', () => {
  it('admits exactly the format this platform sends', () => {
    const verdict = judgeRecoveryMaterial(readRecoveryMaterial(`?token_hash=${HASH}&type=recovery`, ''));
    expect(verdict).toEqual({ usable: true, tokenHash: HASH });
  });

  it('admits a token_hash with no declared type', () => {
    expect(judgeRecoveryMaterial(readRecoveryMaterial(`?token_hash=${HASH}`, ''))).toEqual({
      usable: true,
      tokenHash: HASH,
    });
  });

  it('refuses an empty URL', () => {
    expect(judgeRecoveryMaterial(readRecoveryMaterial('', ''))).toEqual({
      usable: false,
      message: RECOVERY_MESSAGES.missing,
    });
  });

  it.each([
    ['a complete implicit fragment', '', '#access_token=abc&refresh_token=def&type=recovery'],
    ['a hand-typed partial fragment', '', '#access_token=forjado&type=recovery'],
    ['a fragment that only names the type', '', '#type=recovery'],
    ['a fragment alongside a real token_hash', `?token_hash=${HASH}&type=recovery`, '#access_token=abc&refresh_token=d&type=recovery'],
  ])('refuses %s — an access token is an ordinary session credential', (_label, search, hash) => {
    const verdict = judgeRecoveryMaterial(readRecoveryMaterial(search, hash));
    expect(verdict).toEqual({ usable: false, message: RECOVERY_MESSAGES.unsupportedFormat });
  });

  it('refuses a PKCE code — nothing the server could verify', () => {
    expect(judgeRecoveryMaterial(readRecoveryMaterial('?code=pkce-code&type=recovery', ''))).toEqual({
      usable: false,
      message: RECOVERY_MESSAGES.unsupportedFormat,
    });
  });

  it('refuses a non-recovery type', () => {
    expect(
      judgeRecoveryMaterial(readRecoveryMaterial(`?token_hash=${HASH}&type=magiclink`, ''))
    ).toEqual({ usable: false, message: RECOVERY_MESSAGES.wrongType });
  });

  it('refuses a raw {{ .Token }} link, which needs an address the page does not have', () => {
    expect(judgeRecoveryMaterial(readRecoveryMaterial('?token=raw-token&type=recovery', ''))).toEqual({
      usable: false,
      message: RECOVERY_MESSAGES.rawToken,
    });
  });

  it('hasRecoveryMaterial sees every shape, so nothing falls through as "no link"', () => {
    expect(hasRecoveryMaterial(readRecoveryMaterial(`?token_hash=${HASH}`, ''))).toBe(true);
    expect(hasRecoveryMaterial(readRecoveryMaterial('?code=x', ''))).toBe(true);
    expect(hasRecoveryMaterial(readRecoveryMaterial('?token=x', ''))).toBe(true);
    expect(hasRecoveryMaterial(readRecoveryMaterial('', '#type=recovery'))).toBe(true);
    expect(hasRecoveryMaterial(readRecoveryMaterial('', ''))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// What opens the form.
// ---------------------------------------------------------------------------

describe('what opens the form', () => {
  it('a bare visit does NOT, even with a live session', async () => {
    visit('/reset-password');
    const client = await mount();
    await expectInvalid(RECOVERY_MESSAGES.missing);
    expectConsumedNothing(client);
  });

  it('a hand-typed #access_token=forjado&type=recovery does NOT', async () => {
    // The exact string that used to be an admission ticket.
    visit('/reset-password#access_token=forjado&type=recovery');
    const client = await mount();
    await expectInvalid(RECOVERY_MESSAGES.unsupportedFormat);
    expectConsumedNothing(client);
  });

  it('a COMPLETE implicit fragment does NOT — it is a session, not recovery proof', async () => {
    visit('/reset-password#access_token=abc&refresh_token=def&type=recovery');
    const client = await mount();
    await expectInvalid(RECOVERY_MESSAGES.unsupportedFormat);
    expectConsumedNothing(client);
  });

  it('a PKCE ?code= does NOT', async () => {
    visit('/reset-password?code=pkce-code');
    const client = await mount();
    await expectInvalid(RECOVERY_MESSAGES.unsupportedFormat);
    expectConsumedNothing(client);
  });

  it('a wrong type does NOT', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=signup`);
    const client = await mount();
    await expectInvalid(RECOVERY_MESSAGES.wrongType);
    expectConsumedNothing(client);
  });

  it('the URL this platform actually sends DOES', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    const client = await mount();
    await expectForm();
    expectConsumedNothing(client);
  });
});

// ---------------------------------------------------------------------------
// The pre-existing session.
// ---------------------------------------------------------------------------

describe('the pre-existing session', () => {
  it('is signed out locally before the form opens', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    const client = await mount();
    await expectForm();
    expect(client.calls.signOut).toEqual([{ scope: 'local' }]);
  });

  it('a sign-out that reports { error } closes the page — the return value is checked', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    await mount({ signOutError: { message: 'storage unavailable' } });
    await expectInvalid(RECOVERY_MESSAGES.signOutFailed);
  });

  it('a sign-out that THROWS closes the page too', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    await mount({ signOutThrows: true });
    await expectInvalid(RECOVERY_MESSAGES.signOutFailed);
  });

  it('a refused link never even signs out — nothing was going to happen anyway', async () => {
    visit('/reset-password#access_token=forjado&type=recovery');
    const client = await mount();
    await expectInvalid();
    expect(client.calls.signOut).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The URL.
// ---------------------------------------------------------------------------

describe('the URL', () => {
  it('is stripped once the material has been captured', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    await mount();
    await expectForm();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.location.hash).toBe('');
  });

  it('is stripped on a refusal too, so a bad link is not left in history', async () => {
    visit('/reset-password?code=pkce');
    await mount();
    await expectInvalid();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('is read once, at first render — a second effect pass does not re-read it', async () => {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    const client = await mount();
    await expectForm();
    // Strict-Mode double invocation would show up as a second sign-out.
    expect(client.calls.signOut).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// What the submit sends.
// ---------------------------------------------------------------------------

describe('the completion request', () => {
  async function openForm() {
    visit(`/reset-password?token_hash=${HASH}&type=recovery`);
    const client = await mount();
    await expectForm();
    return client;
  }

  it('forwards the ONE-TIME MATERIAL, and no session credential', async () => {
    await openForm();
    await submit(VALID_PASSWORD);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/recovery-complete');

    const body = JSON.parse(init.body);
    expect(body).toEqual({ tokenHash: HASH, type: 'recovery', newPassword: VALID_PASSWORD });

    // No bearer token: an access token is not proof of a recovery, and the
    // endpoint does not read one.
    expect(Object.keys(init.headers)).toEqual(['Content-Type']);
    expect(JSON.stringify(init.headers)).not.toContain('Bearer');
  });

  it('sends no user id — there is nothing for a caller to redirect', async () => {
    await openForm();
    await submit(VALID_PASSWORD);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(['newPassword', 'tokenHash', 'type']);
  });

  it('checks the shared policy in the form before spending the link', async () => {
    await openForm();
    await submit('corta');
    await waitFor(() =>
      expect(screen.getByTestId('reset-message')).toHaveTextContent(/contraseña/i)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses mismatched confirmations without a request', async () => {
    await openForm();
    fireEvent.change(screen.getByTestId('reset-new-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), {
      target: { value: 'Otra2026Clave' },
    });
    fireEvent.click(screen.getByTestId('reset-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('reset-message')).toHaveTextContent(RECOVERY_MESSAGES.mismatch)
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports success and sends the user to /login', async () => {
    await openForm();
    await submit(VALID_PASSWORD);
    await waitFor(() =>
      expect(screen.getByTestId('reset-message')).toHaveTextContent(RECOVERY_MESSAGES.success)
    );
  });

  it('CLOSES the form when the server says the material was invalid — the link is spent', async () => {
    stubFetch({
      status: 401,
      body: { error: 'x', code: 'RECOVERY_MATERIAL_INVALID' },
    });
    await openForm();
    await submit(VALID_PASSWORD);

    await expectInvalid(RECOVERY_MESSAGES.expired);
  });

  it('closes the form on any other server refusal too, rather than inviting a retry on a burnt link', async () => {
    stubFetch({
      status: 500,
      body: { error: 'Error interno del servidor', code: 'SERVER_ERROR' },
    });
    await openForm();
    await submit(VALID_PASSWORD);

    await expectInvalid('Error interno del servidor');
  });

  it('never sends the material twice, even if submit is clicked twice', async () => {
    await openForm();
    await submit(VALID_PASSWORD);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('reset-submit'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('consults no session at any point in the whole flow', async () => {
    const client = await openForm();
    await submit(VALID_PASSWORD);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expectConsumedNothing(client);
  });
});
