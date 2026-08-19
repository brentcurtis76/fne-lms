// @vitest-environment node
/**
 * The trusted password-mutation boundary, as a set of CEREMONIES.
 *
 * ROUND ONE. Two of the three ways a password gets set did the work in the
 * browser: `auth.updateUser({ password })`, a browser PATCH to clear
 * `must_change_password`, and "exitosamente" whether or not the second write
 * landed — with no server-side policy check and no audit row.
 *
 * ROUND TWO moved the write to a server module and then exported it as
 * `completePasswordChange(admin, { userId, newPassword, auditAction })`. Any
 * route could import that, pass any user id, and name its own audit action. The
 * recovery endpoint proved the point: it "proved" identity with an ordinary
 * bearer access token and labelled the result `password_change_recovery`.
 *
 * ROUND THREE — what this suite asserts. There is no exported function that
 * takes a user id and a password. There are four ceremonies, each establishing
 * the identity it acts on, and the audit action is DERIVED from the ceremony
 * rather than accepted from a caller. The tests below are written from the
 * attacker's side: what does each ceremony refuse, and what does it leave
 * unwritten when it refuses?
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CEREMONY_AUDIT_ACTION,
  COMPLETION_MESSAGES,
  clearPasswordChangeFlag,
  completeForcedPasswordChange,
  completeRecoveryPasswordChange,
  completeVoluntaryPasswordChange,
  isCompletionFailure,
  SET_PASSWORD_CHANGE_REQUIRED_RPC,
} from '../../../lib/auth/password-completion';

const LINK_OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const STRONG = 'Sintetica2026';
const HASH = 'hashed-token-from-the-email';

interface AdminOptions {
  updateError?: { message: string; code?: string; status?: number } | null;
  rpcResult?: boolean | null;
  rpcError?: { message: string } | null;
  auditError?: { message: string } | null;
  /** What `profiles.must_change_password` reads back as. */
  mustChangePassword?: boolean | null;
  profileError?: { message: string } | null;
}

function buildAdmin(opts: AdminOptions = {}) {
  const calls = {
    updateUserById: [] as Array<[string, unknown]>,
    rpc: [] as Array<[string, unknown]>,
    audits: [] as Array<Record<string, unknown>>,
    profileReads: [] as string[],
  };

  const profileQuery = () => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((_col: string, val: string) => {
        calls.profileReads.push(val);
        return chain;
      }),
      maybeSingle: vi.fn(async () =>
        opts.profileError
          ? { data: null, error: opts.profileError }
          : {
              data: { must_change_password: opts.mustChangePassword ?? true },
              error: null,
            }
      ),
    };
    return chain;
  };

  const admin: any = {
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
      return { data: 'rpcResult' in opts ? opts.rpcResult : true, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileQuery();
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          calls.audits.push(row);
          return { error: opts.auditError ?? null };
        }),
      };
    }),
    calls,
  };

  return admin;
}

/** A `verifyOtp` double. It records what it was asked and answers as told. */
function buildVerifier(
  opts: { userId?: string | null; error?: { message: string } | null; throws?: boolean } = {}
) {
  const calls: any[] = [];
  const signOuts: unknown[] = [];
  const factory = () => ({
    auth: {
      verifyOtp: vi.fn(async (args: any) => {
        calls.push(args);
        if (opts.throws) throw new Error('network');
        if (opts.error) return { data: null, error: opts.error };
        return {
          data: { user: { id: opts.userId ?? LINK_OWNER }, session: { access_token: 'x' } },
          error: null,
        };
      }),
      signOut: vi.fn(async (o: unknown) => {
        signOuts.push(o);
        return { error: null };
      }),
    },
  });
  return { factory, calls, signOuts };
}

/** A user-scoped client double for the forced and voluntary ceremonies. */
function buildAuthenticated(user: { id?: string; email?: string } | null, error: any = null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error })),
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------

describe('the audit action is derived from the ceremony, not supplied', () => {
  it('maps each ceremony to exactly one action', () => {
    expect(CEREMONY_AUDIT_ACTION).toEqual({
      recovery: 'password_change_recovery',
      forced: 'password_change_forced',
      voluntary: 'password_change_voluntary',
      admin_reset: 'password_reset_admin',
    });
  });

  it('is frozen — a caller cannot relabel a ceremony at runtime', () => {
    expect(Object.isFrozen(CEREMONY_AUDIT_ACTION)).toBe(true);
  });

  it('exports no function that takes a user id and a password', async () => {
    const mod: Record<string, unknown> = await import('../../../lib/auth/password-completion');
    // The raw writer is present under a deliberately awkward name for exactly one
    // consumer, and `scripts/ci/check-browser-boundaries.mjs` fails the build for
    // any other importer.
    expect(mod.completePasswordChange).toBeUndefined();
    expect(typeof mod.__writePasswordThroughTrustedBoundary).toBe('function');
  });
});

describe('clearPasswordChangeFlag', () => {
  it('goes through the trusted database function, not a bare UPDATE', async () => {
    const admin = buildAdmin();
    await clearPasswordChangeFlag(admin as never, LINK_OWNER);

    expect(admin.calls.rpc).toEqual([
      [SET_PASSWORD_CHANGE_REQUIRED_RPC, { p_user_id: LINK_OWNER, p_required: false }],
    ]);
  });

  it('reports "not cleared" when the function matched NO row', async () => {
    const admin = buildAdmin({ rpcResult: false });
    expect(await clearPasswordChangeFlag(admin as never, LINK_OWNER)).toMatchObject({
      cleared: false,
    });
  });

  it('reports "not cleared" when the call errors', async () => {
    const admin = buildAdmin({ rpcError: { message: 'permission denied' } });
    expect(await clearPasswordChangeFlag(admin as never, LINK_OWNER)).toMatchObject({
      cleared: false,
    });
  });

  it('never throws, even when the client does', async () => {
    const admin = {
      rpc: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    };
    expect(await clearPasswordChangeFlag(admin as never, LINK_OWNER)).toMatchObject({
      cleared: false,
    });
  });
});

// ---------------------------------------------------------------------------
// CEREMONY 1 — RECOVERY
// ---------------------------------------------------------------------------

describe('the recovery ceremony', () => {
  it('consumes the material with verifyOtp and acts on the account GoTrue names', async () => {
    const admin = buildAdmin();
    const { factory, calls } = buildVerifier();

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ token_hash: HASH, type: 'recovery' }]);
    expect(admin.calls.updateUserById).toEqual([[LINK_OWNER, { password: STRONG }]]);
  });

  it('passes the literal type "recovery", never the one the request declared', async () => {
    const admin = buildAdmin();
    const { factory, calls } = buildVerifier();

    // A caller that declares the right type still does not get to choose it.
    await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );
    expect(calls[0].type).toBe('recovery');
  });

  it('REFUSES a link that declares any other type, without contacting the provider', async () => {
    const admin = buildAdmin();
    const { factory, calls } = buildVerifier();

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'magiclink', newPassword: STRONG },
      factory as never
    );

    expect(isCompletionFailure(result)).toBe(true);
    expect(calls).toEqual([]);
    expect(admin.calls.updateUserById).toEqual([]);
  });

  it('REFUSES a request with no material at all — an access token is not material', async () => {
    const admin = buildAdmin();
    const { factory, calls } = buildVerifier();

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { newPassword: STRONG } as never,
      factory as never
    );

    expect(isCompletionFailure(result)).toBe(true);
    expect((result as any).status).toBe(401);
    expect(calls).toEqual([]);
    expect(admin.calls.updateUserById).toEqual([]);
    expect(admin.calls.rpc).toEqual([]);
    expect(admin.calls.audits).toEqual([]);
  });

  it('REFUSES expired / malformed / replayed material, and writes NOTHING', async () => {
    // GoTrue answers the same way for all three; so do we, and the important
    // part is what does not happen.
    const admin = buildAdmin();
    const { factory } = buildVerifier({ error: { message: 'Token has expired or is invalid' } });

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect(isCompletionFailure(result)).toBe(true);
    expect((result as any).code).toBe('RECOVERY_MATERIAL_INVALID');
    expect(admin.calls.updateUserById).toEqual([]);
    expect(admin.calls.rpc).toEqual([]);
    expect(admin.calls.audits).toEqual([]);
  });

  it('does not leak the provider wording for an invalid link', async () => {
    const admin = buildAdmin();
    const { factory } = buildVerifier({ error: { message: 'Token has expired or is invalid' } });

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect((result as any).message).toBe(COMPLETION_MESSAGES.recoveryInvalid);
    expect((result as any).message).not.toContain('Token has expired');
  });

  it('survives a thrown verifyOtp as a refusal, not a crash', async () => {
    const admin = buildAdmin();
    const { factory } = buildVerifier({ throws: true });

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect(isCompletionFailure(result)).toBe(true);
    expect(admin.calls.updateUserById).toEqual([]);
  });

  it('a userId in the input CANNOT redirect the write', async () => {
    const admin = buildAdmin();
    const { factory } = buildVerifier({ userId: LINK_OWNER });

    await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG, userId: OTHER } as never,
      factory as never
    );

    expect(admin.calls.updateUserById[0][0]).toBe(LINK_OWNER);
    expect(JSON.stringify(admin.calls.updateUserById)).not.toContain(OTHER);
  });

  it('checks the policy BEFORE burning the one-time material', async () => {
    const admin = buildAdmin();
    const { factory, calls } = buildVerifier();

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: 'weak' },
      factory as never
    );

    expect(isCompletionFailure(result)).toBe(true);
    expect((result as any).code).toBe('PASSWORD_POLICY');
    // The link still works. Burning it because the user typed a short password
    // would strand them.
    expect(calls).toEqual([]);
  });

  it('clears the forced-change flag and audits as a RECOVERY', async () => {
    const admin = buildAdmin();
    const { factory } = buildVerifier();

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect(result.ok).toBe(true);
    expect(admin.calls.rpc).toEqual([
      [SET_PASSWORD_CHANGE_REQUIRED_RPC, { p_user_id: LINK_OWNER, p_required: false }],
    ]);
    expect(admin.calls.audits).toHaveLength(1);
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_recovery',
      outcome: 'success',
      actor_user_id: LINK_OWNER,
      target_user_id: LINK_OWNER,
    });
  });

  it('discards the throwaway session it minted while verifying', async () => {
    const admin = buildAdmin();
    const { factory, signOuts } = buildVerifier();

    await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect(signOuts).toEqual([{ scope: 'local' }]);
  });

  it('reports a partial failure rather than claiming success', async () => {
    const admin = buildAdmin({ rpcResult: false });
    const { factory } = buildVerifier();

    const result = await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    expect(isCompletionFailure(result)).toBe(true);
    expect(result).toMatchObject({
      stage: 'clear_flag',
      status: 500,
      code: 'FLAG_NOT_CLEARED',
      passwordChanged: true,
    });
  });

  it('never puts the material or the password in an audit row', async () => {
    const admin = buildAdmin();
    const { factory } = buildVerifier();

    await completeRecoveryPasswordChange(
      admin as never,
      { tokenHash: HASH, type: 'recovery', newPassword: STRONG },
      factory as never
    );

    const serialised = JSON.stringify(admin.calls.audits);
    expect(serialised).not.toContain(STRONG);
    expect(serialised).not.toContain(HASH);
  });
});

// ---------------------------------------------------------------------------
// CEREMONY 2 — FORCED
// ---------------------------------------------------------------------------

describe('the forced ceremony', () => {
  it('establishes identity with getUser, and writes for that account only', async () => {
    const admin = buildAdmin({ mustChangePassword: true });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
    });

    expect(result.ok).toBe(true);
    expect(authed.auth.getUser).toHaveBeenCalled();
    expect(admin.calls.updateUserById).toEqual([[LINK_OWNER, { password: STRONG }]]);
  });

  it('REFUSES when there is no valid token', async () => {
    const admin = buildAdmin();
    const authed = buildAuthenticated(null, { message: 'invalid JWT' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
    });

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect((result as any).message).toBe(COMPLETION_MESSAGES.notAuthenticated);
    expect(admin.calls.updateUserById).toEqual([]);
  });

  it('REFUSES an account that is NOT under the forced-change regime', async () => {
    // Without this the endpoint is a "change my password without knowing it"
    // route for anyone with a session: it writes with the service role, so
    // GoTrue's own reauthentication never applies.
    const admin = buildAdmin({ mustChangePassword: false });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
    });

    expect(result).toMatchObject({ ok: false, status: 403, code: 'CHANGE_NOT_REQUIRED' });
    expect(admin.calls.updateUserById).toEqual([]);
    expect(admin.calls.audits).toEqual([]);
  });

  it('reads the flag for the CALLER, never for an id from the input', async () => {
    const admin = buildAdmin({ mustChangePassword: true });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
      userId: OTHER,
    } as never);

    expect(admin.calls.profileReads).toEqual([LINK_OWNER]);
    expect(admin.calls.updateUserById[0][0]).toBe(LINK_OWNER);
  });

  it('fails closed, not open, when the flag cannot be read', async () => {
    const admin = buildAdmin({ profileError: { message: 'connection reset' } });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
    });

    expect(result).toMatchObject({ ok: false, status: 503, code: 'PASSWORD_STATE_UNAVAILABLE' });
    expect(admin.calls.updateUserById).toEqual([]);
  });

  it('audits as FORCED, and clears the flag', async () => {
    const admin = buildAdmin({ mustChangePassword: true });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    await completeForcedPasswordChange(admin as never, authed as never, { newPassword: STRONG });

    expect(admin.calls.rpc).toEqual([
      [SET_PASSWORD_CHANGE_REQUIRED_RPC, { p_user_id: LINK_OWNER, p_required: false }],
    ]);
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_forced',
      outcome: 'success',
    });
  });

  it('enforces the shared policy server-side', async () => {
    const admin = buildAdmin({ mustChangePassword: true });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: 'corta',
    });

    expect(result).toMatchObject({ ok: false, status: 400, code: 'PASSWORD_POLICY' });
    expect(admin.calls.updateUserById).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CEREMONY 3 — VOLUNTARY
// ---------------------------------------------------------------------------

describe('the voluntary ceremony', () => {
  const reauthOk = vi.fn(async () => ({ ok: true }));
  const reauthNo = vi.fn(async () => ({ ok: false }));

  beforeEach(() => {
    reauthOk.mockClear();
    reauthNo.mockClear();
  });

  it('requires the CURRENT password — a live session is not enough', async () => {
    const admin = buildAdmin();
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeVoluntaryPasswordChange(
      admin as never,
      authed as never,
      reauthNo,
      { currentPassword: 'wrong', newPassword: STRONG }
    );

    expect(reauthNo).toHaveBeenCalledWith({ email: 'a@synthetic.test', password: 'wrong' });
    expect(result).toMatchObject({ ok: false, status: 400, code: 'CURRENT_PASSWORD_INVALID' });
    expect(admin.calls.updateUserById).toEqual([]);
  });

  it('audits the DENIED attempt — a failed reauthentication on a live session is a signal', async () => {
    const admin = buildAdmin();
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    await completeVoluntaryPasswordChange(admin as never, authed as never, reauthNo, {
      currentPassword: 'wrong',
      newPassword: STRONG,
    });

    expect(admin.calls.audits).toHaveLength(1);
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_voluntary',
      outcome: 'denied',
    });
  });

  it('writes the password once the current one is proved', async () => {
    const admin = buildAdmin();
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeVoluntaryPasswordChange(
      admin as never,
      authed as never,
      reauthOk,
      { currentPassword: 'Anterior2026', newPassword: STRONG }
    );

    expect(result.ok).toBe(true);
    expect(admin.calls.updateUserById).toEqual([[LINK_OWNER, { password: STRONG }]]);
  });

  it('does NOT clear the forced-change flag — it must not release a held account', async () => {
    const admin = buildAdmin();
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    await completeVoluntaryPasswordChange(admin as never, authed as never, reauthOk, {
      currentPassword: 'Anterior2026',
      newPassword: STRONG,
    });

    expect(admin.calls.rpc).toEqual([]);
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_voluntary',
      outcome: 'success',
    });
  });

  it('REFUSES without a valid token, and never reauthenticates', async () => {
    const admin = buildAdmin();
    const authed = buildAuthenticated(null, { message: 'invalid JWT' });

    const result = await completeVoluntaryPasswordChange(
      admin as never,
      authed as never,
      reauthOk,
      { currentPassword: 'Anterior2026', newPassword: STRONG }
    );

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(reauthOk).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Provider errors, shared by every ceremony.
// ---------------------------------------------------------------------------

describe('provider errors never reach the caller in the provider’s words', () => {
  it.each([
    ['a breach-corpus verdict', { message: 'This password has been found in a data breach', status: 422 }, COMPLETION_MESSAGES.weak],
    ['a length refusal', { message: 'Password should be at least 8 characters', status: 422 }, COMPLETION_MESSAGES.weak],
    ['a same-password refusal', { message: 'New password should be different from the old password', code: 'same_password' }, COMPLETION_MESSAGES.samePassword],
    ['an opaque provider failure', { message: 'internal server error' }, COMPLETION_MESSAGES.updateFailed],
  ])('%s becomes one of our sentences', async (_label, providerError, expected) => {
    const admin = buildAdmin({ mustChangePassword: true, updateError: providerError as never });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
    });

    expect(isCompletionFailure(result)).toBe(true);
    expect((result as any).message).toBe(expected);
    expect((result as any).message).not.toContain(providerError.message);
  });

  it('audits the failure without the password', async () => {
    const admin = buildAdmin({
      mustChangePassword: true,
      updateError: { message: 'gotrue said no' },
    });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    await completeForcedPasswordChange(admin as never, authed as never, { newPassword: STRONG });

    expect(admin.calls.audits[0]).toMatchObject({ outcome: 'failure' });
    expect(JSON.stringify(admin.calls.audits)).not.toContain(STRONG);
  });
});

describe('the audit is fail-open and visible', () => {
  it('reports audited:false rather than failing a password change that already happened', async () => {
    const admin = buildAdmin({ mustChangePassword: true, auditError: { message: '42501' } });
    const authed = buildAuthenticated({ id: LINK_OWNER, email: 'a@synthetic.test' });

    const result = await completeForcedPasswordChange(admin as never, authed as never, {
      newPassword: STRONG,
    });

    expect(result).toMatchObject({ ok: true, audited: false });
  });
});
