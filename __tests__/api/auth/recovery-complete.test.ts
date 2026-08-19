// @vitest-environment node
/**
 * /api/auth/recovery-complete — the endpoint the review rejected, from the
 * attacker's side.
 *
 * THE FINDING. The previous version accepted `Authorization: Bearer <access
 * token>`, called `auth.getUser(token)`, and changed that account's password.
 * `getUser` proves a token is valid and says whose it is; it does not say what
 * ceremony minted it, and an ordinary password login mints an indistinguishable
 * one. So any signed-in account could post its own access token here and set a
 * new password with no recovery link and no current password — the S12 defect,
 * reopened at the API boundary.
 *
 * The old suite could not see it: it mocked `getUser` to return a user and never
 * distinguished a login token from recovery material. So this one is written the
 * other way round. Every test either drives REAL recovery material through a
 * `verifyOtp` double, or presents something that is NOT recovery material and
 * asserts that nothing at all was written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockCreateClient, verifyOtpImpl } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockCreateClient: vi.fn(),
  verifyOtpImpl: { current: null as any },
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, rateLimit: () => async () => true };
});

import handler from '../../../pages/api/auth/recovery-complete';

const LINK_OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '99999999-9999-4999-8999-999999999999';
const HASH = 'one-time-hash-from-the-email';
const LOGIN_ACCESS_TOKEN = 'an-ordinary-password-login-access-token';
const STRONG = 'Sintetica2026';

interface Options {
  /** Hashes the fake GoTrue will accept. Consumed on first use, like the real thing. */
  validHashes?: string[];
  updateError?: { message: string; status?: number; code?: string } | null;
  rpcResult?: boolean;
  rpcError?: { message: string } | null;
}

function setup(opts: Options = {}) {
  const remaining = new Set(opts.validHashes ?? [HASH]);

  const calls = {
    verifyOtp: [] as any[],
    getUser: [] as unknown[],
    updateUserById: [] as Array<[string, unknown]>,
    rpc: [] as Array<[string, unknown]>,
    audits: [] as Array<Record<string, unknown>>,
  };

  // A stand-in for GoTrue's own behaviour: a `token_hash` verifies at most once,
  // only for `type: 'recovery'`, and an access token is simply not a hash.
  mockCreateClient.mockImplementation(() => ({
    auth: {
      verifyOtp: vi.fn(async (args: any) => {
        calls.verifyOtp.push(args);
        if (args?.type !== 'recovery') {
          return { data: null, error: { message: 'Token type mismatch' } };
        }
        if (!remaining.has(args?.token_hash)) {
          return { data: null, error: { message: 'Token has expired or is invalid' } };
        }
        remaining.delete(args.token_hash); // one-time
        return {
          data: { user: { id: LINK_OWNER }, session: { access_token: 'fresh' } },
          error: null,
        };
      }),
      // Present so that a handler which TRIED to use it would still be caught by
      // the assertions below rather than by a TypeError.
      getUser: vi.fn(async (token: unknown) => {
        calls.getUser.push(token);
        return { data: { user: { id: OTHER_USER } }, error: null };
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }));

  mockCreateServiceRoleClient.mockReturnValue({
    auth: {
      admin: {
        updateUserById: vi.fn(async (id: string, payload: unknown) => {
          calls.updateUserById.push([id, payload]);
          return opts.updateError
            ? { data: null, error: opts.updateError }
            : { data: { user: { id } }, error: null };
        }),
      },
    },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.rpc.push([fn, args]);
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.rpcResult ?? true, error: null };
    }),
    from: vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        calls.audits.push(row);
        return { error: null };
      }),
    })),
  });

  return calls;
}

/** Every write the endpoint could make. Used to assert "nothing happened". */
function assertNothingWritten(calls: ReturnType<typeof setup>) {
  expect(calls.updateUserById).toEqual([]);
  expect(calls.rpc).toEqual([]);
  expect(calls.audits).toEqual([]);
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { req, res } = createMocks({
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
  await handler(req as never, res as never);
  return { res, json: res._getJSONData() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

// ---------------------------------------------------------------------------
// THE FINDING: an ordinary session credential must not satisfy the ceremony.
// ---------------------------------------------------------------------------

describe('an ordinary access token is not recovery proof', () => {
  it('a bearer access token alone is REFUSED, and nothing is written', async () => {
    // The exact request the previous version accepted.
    const calls = setup();
    const { res, json } = await post(
      { newPassword: STRONG },
      { authorization: `Bearer ${LOGIN_ACCESS_TOKEN}` }
    );

    expect(res._getStatusCode()).toBe(401);
    expect(json.code).toBe('RECOVERY_MATERIAL_INVALID');
    assertNothingWritten(calls);
  });

  it('the handler never even looks at the Authorization header', async () => {
    const calls = setup();
    await post({ newPassword: STRONG }, { authorization: `Bearer ${LOGIN_ACCESS_TOKEN}` });

    // `getUser` is the call that used to establish identity. It is not made.
    expect(calls.getUser).toEqual([]);
    expect(calls.verifyOtp).toEqual([]);
  });

  it('an access token presented AS the token hash is refused by the auth server', async () => {
    // The next thing an attacker tries. GoTrue does not accept a session token
    // where a one-time hash belongs.
    const calls = setup();
    const { res } = await post({ tokenHash: LOGIN_ACCESS_TOKEN, newPassword: STRONG });

    expect(res._getStatusCode()).toBe(401);
    expect(calls.verifyOtp).toEqual([
      { token_hash: LOGIN_ACCESS_TOKEN, type: 'recovery' },
    ]);
    assertNothingWritten(calls);
  });

  it('a session cookie is not read either', async () => {
    const calls = setup();
    const { res } = await post(
      { newPassword: STRONG },
      { cookie: 'sb-access-token=whatever; sb-refresh-token=whatever' }
    );

    expect(res._getStatusCode()).toBe(401);
    assertNothingWritten(calls);
  });
});

// ---------------------------------------------------------------------------
// The happy path, with real material.
// ---------------------------------------------------------------------------

describe('genuine recovery material', () => {
  it('succeeds, and acts on the LINK OWNER', async () => {
    const calls = setup();
    const { res, json } = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(res._getStatusCode()).toBe(200);
    expect(json.success).toBe(true);
    expect(calls.verifyOtp).toEqual([{ token_hash: HASH, type: 'recovery' }]);
    expect(calls.updateUserById).toEqual([[LINK_OWNER, { password: STRONG }]]);
  });

  it('clears the forced-change flag through the trusted database path', async () => {
    const calls = setup();
    await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(calls.rpc).toEqual([
      ['set_password_change_required', { p_user_id: LINK_OWNER, p_required: false }],
    ]);
  });

  it('records password_change_recovery for the link owner', async () => {
    const calls = setup();
    await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(calls.audits).toHaveLength(1);
    expect(calls.audits[0]).toMatchObject({
      action: 'password_change_recovery',
      outcome: 'success',
      actor_user_id: LINK_OWNER,
      target_user_id: LINK_OWNER,
    });
  });

  it('puts neither the password nor the material in the response or the trail', async () => {
    const calls = setup();
    const { json } = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    const body = JSON.stringify(json);
    expect(body).not.toContain(STRONG);
    expect(body).not.toContain(HASH);
    const trail = JSON.stringify(calls.audits);
    expect(trail).not.toContain(STRONG);
    expect(trail).not.toContain(HASH);
  });
});

// ---------------------------------------------------------------------------
// Replay, expiry, malformation, wrong purpose.
// ---------------------------------------------------------------------------

describe('the material is one-time, expiring and purpose-bound', () => {
  it('REPLAYING the same material fails the second time', async () => {
    const calls = setup();

    const first = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });
    expect(first.res._getStatusCode()).toBe(200);

    const second = await post({ tokenHash: HASH, type: 'recovery', newPassword: 'Otra2026Clave' });
    expect(second.res._getStatusCode()).toBe(401);
    expect(second.json.code).toBe('RECOVERY_MATERIAL_INVALID');

    // Exactly one password write across both requests.
    expect(calls.updateUserById).toHaveLength(1);
    expect(calls.updateUserById[0][1]).toEqual({ password: STRONG });
  });

  it('EXPIRED material fails and writes nothing', async () => {
    const calls = setup({ validHashes: [] });
    const { res } = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(res._getStatusCode()).toBe(401);
    assertNothingWritten(calls);
  });

  it('MALFORMED material fails and writes nothing', async () => {
    const calls = setup();
    const { res } = await post({ tokenHash: '!!!not-a-hash!!!', newPassword: STRONG });

    expect(res._getStatusCode()).toBe(401);
    assertNothingWritten(calls);
  });

  it('a non-string tokenHash is refused before the provider is contacted', async () => {
    const calls = setup();
    const { res } = await post({ tokenHash: { evil: true }, newPassword: STRONG });

    expect(res._getStatusCode()).toBe(401);
    expect(calls.verifyOtp).toEqual([]);
    assertNothingWritten(calls);
  });

  it('a link that declares a NON-recovery type is refused without contacting the provider', async () => {
    const calls = setup();
    const { res } = await post({ tokenHash: HASH, type: 'magiclink', newPassword: STRONG });

    expect(res._getStatusCode()).toBe(401);
    expect(calls.verifyOtp).toEqual([]);
    assertNothingWritten(calls);
  });

  it('always asks the provider for type "recovery", whatever the request said', async () => {
    const calls = setup();
    await post({ tokenHash: HASH, newPassword: STRONG });
    expect(calls.verifyOtp[0].type).toBe('recovery');
  });
});

// ---------------------------------------------------------------------------
// Cross-account behaviour.
// ---------------------------------------------------------------------------

describe('cross-account behaviour', () => {
  it('a userId in the BODY cannot redirect the write', async () => {
    const calls = setup();
    await post({
      tokenHash: HASH,
      type: 'recovery',
      newPassword: STRONG,
      userId: OTHER_USER,
      targetUserId: OTHER_USER,
      email: 'otro@synthetic.test',
    });

    expect(calls.updateUserById[0][0]).toBe(LINK_OWNER);
    expect(JSON.stringify(calls.updateUserById)).not.toContain(OTHER_USER);
    expect(JSON.stringify(calls.audits)).not.toContain(OTHER_USER);
  });

  it('a signed-in visitor opening ANOTHER account link affects only the link owner', async () => {
    // The visitor's own session travels in the request. It changes nothing:
    // the account acted on is the one the material verified as.
    const calls = setup();
    const { res } = await post(
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      {
        authorization: `Bearer ${LOGIN_ACCESS_TOKEN}`,
        cookie: `sb-access-token=${LOGIN_ACCESS_TOKEN}`,
      }
    );

    expect(res._getStatusCode()).toBe(200);
    expect(calls.updateUserById).toEqual([[LINK_OWNER, { password: STRONG }]]);
    expect(calls.getUser).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Policy, partial failure, method, copy.
// ---------------------------------------------------------------------------

describe('policy and failure reporting', () => {
  it('a weak password is refused server-side WITHOUT burning the link', async () => {
    const calls = setup();
    const weak = await post({ tokenHash: HASH, type: 'recovery', newPassword: 'corta' });

    expect(weak.res._getStatusCode()).toBe(400);
    expect(calls.verifyOtp).toEqual([]);

    // The same link still works afterwards, which is the point.
    const good = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });
    expect(good.res._getStatusCode()).toBe(200);
  });

  it('an absent password is refused in es-CL', async () => {
    const calls = setup();
    const { res, json } = await post({ tokenHash: HASH, type: 'recovery' });

    expect(res._getStatusCode()).toBe(400);
    expect(json.error).toBe('La nueva contraseña es obligatoria');
    expect(calls.verifyOtp).toEqual([]);
  });

  it('a flag that will not clear is reported as a PARTIAL failure, not a success', async () => {
    const calls = setup({ rpcResult: false });
    const { res, json } = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(res._getStatusCode()).toBe(500);
    expect(json.code).toBe('FLAG_NOT_CLEARED');
    expect(json.passwordChanged).toBe(true);
    expect(calls.updateUserById).toHaveLength(1);
  });

  it('a provider refusal is mapped to our wording', async () => {
    setup({ updateError: { message: 'This password has been found in a data breach', status: 422 } });
    const { res, json } = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(res._getStatusCode()).toBe(400);
    expect(json.error).toBe('La contraseña no cumple con los requisitos de seguridad del sistema');
    expect(json.error).not.toContain('data breach');
  });

  it('refuses a non-POST method in es-CL', async () => {
    setup();
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error).toBe('Método no permitido');
  });

  it('every user-visible message is Chilean Spanish', async () => {
    setup({ validHashes: [] });
    const { json } = await post({ tokenHash: HASH, type: 'recovery', newPassword: STRONG });

    expect(json.error).toMatch(/enlace de recuperación/i);
    expect(json.error).not.toMatch(/\b(Unauthorized|Invalid|required|Failed|not allowed)\b/);
  });
});
