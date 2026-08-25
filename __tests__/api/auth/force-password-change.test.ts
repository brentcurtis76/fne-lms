// @vitest-environment node
/**
 * F3 — /api/auth/force-password-change, and the reason it now matters.
 *
 * This endpoint already existed and already did most of the right things. The
 * defect was that it was never reached: `/change-password` called
 * `supabase.auth.updateUser({ password })` from the browser and only fell back
 * here when GoTrue answered 422. "Secure password change" is off on this
 * project, so the 422 never came — meaning the ordinary forced change bypassed
 * the server-side policy check, bypassed the flag clear, and wrote no
 * `password_change_forced` row. The audit action existed and was never emitted
 * on the happy path.
 *
 * The page now posts here unconditionally (asserted in
 * `__tests__/components/ChangePasswordPage.forcedCompletion.test.tsx`), so these
 * are the properties that carry the whole forced-change flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient, mockCreatePagesServerClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockCreatePagesServerClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: (...args: unknown[]) => mockCreatePagesServerClient(...args),
}));

vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, rateLimit: () => async () => true };
});

import handler from '../../../pages/api/auth/force-password-change';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const STRONG = 'Sintetica2026';

interface Options {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  mustChange?: boolean | null;
  profileError?: { message: string } | null;
  updateError?: { message: string; status?: number } | null;
  rpcResult?: boolean;
  rpcError?: { message: string } | null;
}

function setup(opts: Options = {}) {
  const calls = {
    getUser: 0,
    getSession: 0,
    updateUserById: [] as Array<[string, unknown]>,
    rpc: [] as Array<[string, unknown]>,
    audits: [] as Array<Record<string, unknown>>,
    profileSelects: [] as unknown[],
  };

  mockCreatePagesServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => {
        calls.getUser += 1;
        if (opts.userError) return { data: { user: null }, error: opts.userError };
        return { data: { user: 'user' in opts ? opts.user : { id: USER } }, error: null };
      }),
      // Present so a regression back to the cookie-decoding read is visible.
      getSession: vi.fn(async () => {
        calls.getSession += 1;
        return { data: { session: { user: { id: OTHER } } } };
      }),
    },
  });

  mockCreateServiceRoleClient.mockReturnValue({
    auth: {
      admin: {
        updateUserById: vi.fn(async (id: string, payload: unknown) => {
          calls.updateUserById.push([id, payload]);
          if (opts.updateError && (payload as Record<string, unknown>).password) {
            return { data: null, error: opts.updateError };
          }
          return { data: { user: { id } }, error: null };
        }),
      },
    },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.rpc.push([fn, args]);
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.rpcResult ?? true, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn((cols: unknown) => {
            calls.profileSelects.push(cols);
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: opts.profileError
                    ? null
                    : { must_change_password: opts.mustChange ?? true },
                  error: opts.profileError ?? null,
                })),
              })),
            };
          }),
        };
      }
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          calls.audits.push(row);
          return { error: null };
        }),
      };
    }),
  });

  return calls;
}

async function run(opts: Options = {}, body: unknown = { newPassword: STRONG }, method = 'POST') {
  const calls = setup(opts);
  const { req, res } = createMocks({ method, body });
  await handler(req as never, res as never);
  return { res, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('authentication', () => {
  it('uses auth.getUser(), never auth.getSession()', async () => {
    // getSession decodes the session cookie and hands back what it contains.
    // This handler is about to write a password with the service role.
    const { calls } = await run();
    expect(calls.getUser).toBe(1);
    expect(calls.getSession).toBe(0);
  });

  it('401 when the auth server names nobody', async () => {
    const { res, calls } = await run({ user: null });
    expect(res._getStatusCode()).toBe(401);
    expect(calls.updateUserById).toEqual([]);
  });

  it('405 for a non-POST method', async () => {
    const { res } = await run({}, {}, 'GET');
    expect(res._getStatusCode()).toBe(405);
  });
});

describe('the flag must actually be set', () => {
  it('403 for an account that is NOT under the forced-change regime', async () => {
    // This endpoint writes with the service role, bypassing GoTrue's own
    // reauthentication requirement. It must not become a general "change my
    // password without knowing it" route.
    const { res, calls } = await run({ mustChange: false });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().code).toBe('CHANGE_NOT_REQUIRED');
    expect(calls.updateUserById).toEqual([]);
  });

  it('503, not 403, when the state cannot be read — fail closed but distinguishable', async () => {
    const { res, calls } = await run({ profileError: { message: 'connection reset' } });
    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData().code).toBe('PASSWORD_STATE_UNAVAILABLE');
    expect(calls.updateUserById).toEqual([]);
  });

  it('reads the state with the SERVICE-ROLE client', async () => {
    // The caller is by definition flagged, so a user-scoped read of their own
    // profile is exactly what the database gate refuses.
    const { calls } = await run();
    expect(calls.profileSelects).toEqual(['must_change_password']);
  });
});

describe('the completion', () => {
  it('validates the shared policy server-side', async () => {
    const { res, calls } = await run({}, { newPassword: 'abc123' });
    expect(res._getStatusCode()).toBe(400);
    expect(calls.updateUserById).toEqual([]);
  });

  it('400 when no password is supplied', async () => {
    const { res } = await run({}, {});
    expect(res._getStatusCode()).toBe(400);
  });

  it('writes only the authenticated account', async () => {
    const { calls } = await run({}, { newPassword: STRONG, userId: OTHER });
    expect(calls.updateUserById[0]).toEqual([USER, { password: STRONG }]);
    expect(JSON.stringify(calls.updateUserById[0])).not.toContain(OTHER);
  });

  it('clears the flag through the trusted database function', async () => {
    const { calls } = await run();
    expect(calls.rpc).toEqual([
      ['set_password_change_required', { p_user_id: USER, p_required: false }],
    ]);
  });

  it('ALWAYS emits password_change_forced on success', async () => {
    // The old flow emitted it only on the 422 fallback, which never fired.
    const { res, calls } = await run();
    expect(res._getStatusCode()).toBe(200);
    expect(calls.audits.filter((a) => a.action === 'password_change_forced')).toHaveLength(1);
    expect(calls.audits[0]).toMatchObject({
      action: 'password_change_forced',
      outcome: 'success',
      actor_user_id: USER,
      target_user_id: USER,
    });
  });

  it('does NOT report success when the flag clear fails', async () => {
    const { res } = await run({ rpcError: { message: 'deadlock detected' } });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().code).toBe('FLAG_NOT_CLEARED');
    expect(res._getJSONData().passwordChanged).toBe(true);
  });

  it('does not let the cosmetic metadata clear fail the operation', async () => {
    // The admin-reset marker is cleared last and best-effort, after the audit.
    const { res, calls } = await run();
    expect(res._getStatusCode()).toBe(200);
    // Two updateUserById calls: the password, then the marker.
    expect(calls.updateUserById).toHaveLength(2);
    expect(calls.updateUserById[1][1]).toMatchObject({
      user_metadata: { password_reset_by_admin: null },
    });
  });
});

describe('nothing sensitive leaves the handler', () => {
  it('never returns the provider error', async () => {
    const { res } = await run({ updateError: { message: 'password found in breach corpus', status: 422 } });
    expect(res._getData()).not.toContain('breach corpus');
    expect(res._getJSONData().error).toContain('requisitos de seguridad');
  });

  it('never returns the password', async () => {
    const { res } = await run();
    expect(res._getData()).not.toContain(STRONG);
  });
});
