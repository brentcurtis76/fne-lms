// @vitest-environment node
/**
 * F3 — /api/auth/recovery-complete.
 *
 * This endpoint did not exist. `/reset-password` wrote the password from the
 * browser, cleared the forced-change flag from the browser, ignored whether that
 * second write landed, and recorded nothing.
 *
 * The property that matters here is WHERE THE IDENTITY COMES FROM. The caller
 * sends the access token its verified recovery credential produced; the handler
 * hands that token to `auth.getUser(token)`, which is a round trip to GoTrue.
 * The account whose password changes is the account GoTrue names — never one the
 * request body chooses, and never one a session cookie claims.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockCreateClient, getUserImpl } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockCreateClient: vi.fn(),
  getUserImpl: { current: null as any },
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
const OWNER_TOKEN = 'verified-recovery-access-token';
const STRONG = 'Sintetica2026';

interface Options {
  tokenUser?: { id: string } | null;
  tokenError?: { message: string } | null;
  updateError?: { message: string; status?: number; code?: string } | null;
  rpcResult?: boolean;
  rpcError?: { message: string } | null;
}

function setup(opts: Options = {}) {
  const calls = {
    getUser: [] as unknown[],
    updateUserById: [] as Array<[string, unknown]>,
    rpc: [] as Array<[string, unknown]>,
    audits: [] as Array<Record<string, unknown>>,
  };

  mockCreateClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async (token: unknown) => {
        calls.getUser.push(token);
        if (opts.tokenError) return { data: { user: null }, error: opts.tokenError };
        return {
          data: { user: 'tokenUser' in opts ? opts.tokenUser : { id: LINK_OWNER } },
          error: null,
        };
      }),
    },
  });

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

async function run(
  opts: Options = {},
  {
    token = OWNER_TOKEN,
    body = { newPassword: STRONG },
    method = 'POST',
  }: { token?: string | null; body?: unknown; method?: string } = {}
) {
  const calls = setup(opts);
  const { req, res } = createMocks({
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  });
  await handler(req as never, res as never);
  return { res, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('identity comes from the recovery token and nowhere else', () => {
  it('401 with no bearer token — a session cookie is not a substitute', async () => {
    const { res, calls } = await run({}, { token: null });
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().code).toBe('NO_RECOVERY_TOKEN');
    expect(calls.updateUserById).toEqual([]);
  });

  it('verifies the token WITH THE AUTH SERVER before doing anything', async () => {
    const { calls } = await run();
    expect(calls.getUser).toEqual([OWNER_TOKEN]);
  });

  it('401 when the auth server rejects the token', async () => {
    const { res, calls } = await run({ tokenError: { message: 'token is expired' } });
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().code).toBe('RECOVERY_TOKEN_INVALID');
    expect(calls.updateUserById).toEqual([]);
  });

  it('401 when the token verifies but names no user', async () => {
    const { res, calls } = await run({ tokenUser: null });
    expect(res._getStatusCode()).toBe(401);
    expect(calls.updateUserById).toEqual([]);
  });

  it('never returns the provider wording for a bad token', async () => {
    const { res } = await run({ tokenError: { message: 'JWT expired at 2026-01-01' } });
    expect(res._getData()).not.toContain('JWT');
    expect(res._getData()).not.toContain('2026-01-01');
  });

  it('writes ONLY the account the token names, whatever the body says', async () => {
    // The body has no user id field at all, and adding one changes nothing.
    const { res, calls } = await run(
      {},
      { body: { newPassword: STRONG, userId: OTHER_USER, targetUserId: OTHER_USER } }
    );

    expect(res._getStatusCode()).toBe(200);
    expect(calls.updateUserById).toEqual([[LINK_OWNER, { password: STRONG }]]);
    expect(JSON.stringify(calls.updateUserById)).not.toContain(OTHER_USER);
    expect(calls.rpc[0][1]).toEqual({ p_user_id: LINK_OWNER, p_required: false });
  });

  it('a signed-in visitor using ANOTHER account link only ever moves that account', async () => {
    // The token came from the link; the visitor's own cookie is not consulted
    // anywhere in this handler.
    const { calls } = await run({ tokenUser: { id: LINK_OWNER } });
    expect(calls.updateUserById[0][0]).toBe(LINK_OWNER);
  });
});

describe('the shared policy is enforced here, not in the tab', () => {
  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'sintetica2026'],
    ['no digit', 'SinteticaClave'],
  ])('400 for %s, with nothing written', async (_label, password) => {
    const { res, calls } = await run({}, { body: { newPassword: password } });
    expect(res._getStatusCode()).toBe(400);
    expect(calls.updateUserById).toEqual([]);
    expect(calls.rpc).toEqual([]);
  });

  it('400 when no password is supplied', async () => {
    const { res } = await run({}, { body: {} });
    expect(res._getStatusCode()).toBe(400);
  });

  it('405 for a non-POST method', async () => {
    const { res } = await run({}, { method: 'GET' });
    expect(res._getStatusCode()).toBe(405);
  });
});

describe('enforcement state and the audit trail', () => {
  it('clears the forced-change flag through the trusted database function', async () => {
    const { calls } = await run();
    expect(calls.rpc).toEqual([
      ['set_password_change_required', { p_user_id: LINK_OWNER, p_required: false }],
    ]);
  });

  it('records `password_change_recovery` — the action that did not exist', async () => {
    const { res, calls } = await run();
    expect(res._getStatusCode()).toBe(200);
    expect(calls.audits).toHaveLength(1);
    expect(calls.audits[0]).toMatchObject({
      action: 'password_change_recovery',
      outcome: 'success',
      actor_user_id: LINK_OWNER,
      target_user_id: LINK_OWNER,
    });
  });

  it('does NOT report success when the flag clear fails', async () => {
    const { res } = await run({ rpcError: { message: 'deadlock detected' } });

    expect(res._getStatusCode()).toBe(500);
    const body = res._getJSONData();
    expect(body.code).toBe('FLAG_NOT_CLEARED');
    // The user must know their new password works even though the app is about
    // to hold them at /change-password again.
    expect(body.passwordChanged).toBe(true);
    expect(body.success).toBeUndefined();
  });

  it('reports an unrecorded audit rather than failing a change that DID happen', async () => {
    // Fail-open and visible. The password has already changed by the time the
    // row is attempted; refusing the response would report a failure that did
    // not occur. The caller learns the truth from `audited`.
    const calls = setup({});
    mockCreateServiceRoleClient.mockReturnValue({
      auth: {
        admin: {
          updateUserById: vi.fn(async (id: string) => ({ data: { user: { id } }, error: null })),
        },
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({ error: { message: 'relation does not exist' } })),
      })),
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: `Bearer ${OWNER_TOKEN}` },
      body: { newPassword: STRONG },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, audited: false });
    expect(calls).toBeDefined();
  });
});

describe('nothing sensitive leaves the handler', () => {
  it('never echoes the recovery token', async () => {
    const { res } = await run();
    expect(res._getData()).not.toContain(OWNER_TOKEN);
  });

  it('never echoes the password', async () => {
    const { res } = await run();
    expect(res._getData()).not.toContain(STRONG);
  });

  it('never puts the token or the password in the audit metadata', async () => {
    const { calls } = await run();
    const serialised = JSON.stringify(calls.audits);
    expect(serialised).not.toContain(OWNER_TOKEN);
    expect(serialised).not.toContain(STRONG);
  });
});
