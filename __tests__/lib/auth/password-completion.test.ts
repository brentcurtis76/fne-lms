// @vitest-environment node
/**
 * F3 — the one trusted path every password completion goes through.
 *
 * WHAT WAS BROKEN. Two of the three ways a password gets set did the work in the
 * browser. `/reset-password` called `auth.updateUser({ password })`, cleared
 * `must_change_password` with a browser PATCH, and said "exitosamente" whether
 * or not that second write landed — with no server-side policy check anywhere
 * and no audit row for a recovery or a first password. `/change-password` did
 * the same and only reached the audited endpoint on a 422 that this project's
 * configuration never produces.
 *
 * This suite asserts the properties that make the shared module trustworthy, one
 * at a time, because each of them is a thing the old flow got wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COMPLETION_MESSAGES,
  clearPasswordChangeFlag,
  completePasswordChange,
  isCompletionFailure,
  SET_PASSWORD_CHANGE_REQUIRED_RPC,
} from '../../../lib/auth/password-completion';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const STRONG = 'Sintetica2026';

interface AdminOptions {
  updateError?: { message: string; code?: string; status?: number } | null;
  /** What `set_password_change_required` returns. */
  rpcResult?: boolean | null;
  rpcError?: { message: string } | null;
  auditError?: { message: string } | null;
}

function buildAdmin(opts: AdminOptions = {}) {
  const calls = {
    updateUserById: [] as Array<[string, unknown]>,
    rpc: [] as Array<[string, unknown]>,
    audits: [] as Array<Record<string, unknown>>,
  };

  const admin = {
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
    from: vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        calls.audits.push(row);
        return { error: opts.auditError ?? null };
      }),
    })),
    calls,
  };

  return admin;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('clearPasswordChangeFlag', () => {
  it('goes through the trusted database function, not a bare UPDATE', async () => {
    const admin = buildAdmin();
    await clearPasswordChangeFlag(admin as never, USER);

    expect(admin.calls.rpc).toEqual([
      [SET_PASSWORD_CHANGE_REQUIRED_RPC, { p_user_id: USER, p_required: false }],
    ]);
  });

  it('reports "not cleared" when the function matched NO row', async () => {
    // `.update().eq()` could not tell "cleared" from "matched nothing", so an
    // account that vanished mid-flow looked like a success.
    const admin = buildAdmin({ rpcResult: false });
    expect(await clearPasswordChangeFlag(admin as never, USER)).toMatchObject({ cleared: false });
  });

  it('reports "not cleared" when the call errors', async () => {
    const admin = buildAdmin({ rpcError: { message: 'permission denied' } });
    expect(await clearPasswordChangeFlag(admin as never, USER)).toMatchObject({ cleared: false });
  });

  it('never throws, even when the client does', async () => {
    const admin = { rpc: vi.fn(async () => { throw new Error('socket hang up'); }) };
    expect(await clearPasswordChangeFlag(admin as never, USER)).toMatchObject({ cleared: false });
  });
});

describe('the password policy is enforced SERVER-SIDE', () => {
  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'sintetica2026'],
    ['no lowercase', 'SINTETICA2026'],
    ['no digit', 'SinteticaClave'],
    ['empty', ''],
  ])('refuses %s before anything is written', async (_label, password) => {
    const admin = buildAdmin();
    const result = await completePasswordChange(admin as never, {
      userId: USER,
      newPassword: password,
      auditAction: 'password_change_recovery',
      clearFlag: true,
      logPrefix: '[test]',
    });

    expect(isCompletionFailure(result)).toBe(true);
    expect(result).toMatchObject({ stage: 'policy', status: 400, passwordChanged: false });
    // Nothing was attempted. The old recovery page's only check ran in the tab
    // the caller controls.
    expect(admin.calls.updateUserById).toEqual([]);
    expect(admin.calls.rpc).toEqual([]);
  });
});

describe('the write lands on the PROVED account only', () => {
  it('passes the caller-proved id to updateUserById and nothing else', async () => {
    const admin = buildAdmin();
    await completePasswordChange(admin as never, {
      userId: USER,
      newPassword: STRONG,
      auditAction: 'password_change_recovery',
      clearFlag: true,
      logPrefix: '[test]',
    });

    expect(admin.calls.updateUserById).toEqual([[USER, { password: STRONG }]]);
    expect(JSON.stringify(admin.calls.updateUserById)).not.toContain(OTHER);
    expect(admin.calls.rpc[0][1]).toEqual({ p_user_id: USER, p_required: false });
  });
});

describe('ordering: password, then flag, then audit', () => {
  it('does not clear the flag when the password write fails', async () => {
    // Clearing first would release the account from the gate while it still
    // carries the credential it was issued.
    const admin = buildAdmin({ updateError: { message: 'gotrue down' } });
    const result = await completePasswordChange(admin as never, {
      userId: USER,
      newPassword: STRONG,
      auditAction: 'password_change_forced',
      clearFlag: true,
      logPrefix: '[test]',
    });

    expect(isCompletionFailure(result)).toBe(true);
    expect(result).toMatchObject({ stage: 'set_password', passwordChanged: false });
    expect(admin.calls.rpc).toEqual([]);
  });

  it('clears the flag before it records the success', async () => {
    const admin = buildAdmin();
    await completePasswordChange(admin as never, {
      userId: USER,
      newPassword: STRONG,
      auditAction: 'password_change_forced',
      clearFlag: true,
      logPrefix: '[test]',
    });

    expect(admin.calls.rpc).toHaveLength(1);
    expect(admin.calls.audits).toHaveLength(1);
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_forced',
      outcome: 'success',
      actor_user_id: USER,
      target_user_id: USER,
    });
  });
});

describe('partial failure is reported, not papered over', () => {
  it('a failed flag clear returns ok:false with passwordChanged:true', async () => {
    const admin = buildAdmin({ rpcError: { message: 'deadlock detected' } });
    const result = await completePasswordChange(admin as never, {
      userId: USER,
      newPassword: STRONG,
      auditAction: 'password_change_forced',
      clearFlag: true,
      logPrefix: '[test]',
    });

    expect(isCompletionFailure(result)).toBe(true);
    expect(result).toMatchObject({
      stage: 'clear_flag',
      status: 500,
      code: 'FLAG_NOT_CLEARED',
      passwordChanged: true,
      message: COMPLETION_MESSAGES.flagNotCleared,
    });
  });

  it('records the partial failure as `partial_failure`, not as a success', async () => {
    const admin = buildAdmin({ rpcResult: false });
    await completePasswordChange(admin as never, {
      userId: USER,
      newPassword: STRONG,
      auditAction: 'password_change_recovery',
      clearFlag: true,
      logPrefix: '[test]',
    });

    expect(admin.calls.audits).toHaveLength(1);
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_recovery',
      outcome: 'partial_failure',
    });
    expect((admin.calls.audits[0].metadata as Record<string, unknown>).stage).toBe('clear_flag');
  });

  it('RETRYING after a partial failure is safe and reaches success', async () => {
    // The password write is idempotent from the user's point of view and the
    // flag clear is an UPDATE to a constant, so the second attempt completes.
    const failing = buildAdmin({ rpcError: { message: 'deadlock detected' } });
    const first = await completePasswordChange(failing as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_forced',
      clearFlag: true, logPrefix: '[test]',
    });
    expect(isCompletionFailure(first)).toBe(true);

    const recovered = buildAdmin();
    const second = await completePasswordChange(recovered as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_forced',
      clearFlag: true, logPrefix: '[test]',
    });
    expect(second).toMatchObject({ ok: true });
    expect(recovered.calls.rpc).toHaveLength(1);
  });
});

describe('the audit row', () => {
  it('is always written on success, with the typed action', async () => {
    for (const action of ['password_change_forced', 'password_change_recovery', 'password_change_voluntary'] as const) {
      const admin = buildAdmin();
      await completePasswordChange(admin as never, {
        userId: USER, newPassword: STRONG, auditAction: action,
        clearFlag: false, logPrefix: '[test]',
      });
      expect(admin.calls.audits[0]).toMatchObject({ action, outcome: 'success' });
    }
  });

  it('fails OPEN and visibly — the password already changed', async () => {
    const admin = buildAdmin({ auditError: { message: 'relation does not exist' } });
    const result = await completePasswordChange(admin as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_recovery',
      clearFlag: true, logPrefix: '[test]',
    });

    // Reporting a failure here would tell the user their change did not work
    // when it did. The response carries `audited: false` instead.
    expect(result).toMatchObject({ ok: true, audited: false });
  });

  it('carries no password, token or URL', async () => {
    const admin = buildAdmin();
    await completePasswordChange(admin as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_recovery',
      auditMetadata: { change_type: 'recovery_link' },
      clearFlag: true, logPrefix: '[test]',
    });

    const serialised = JSON.stringify(admin.calls.audits);
    expect(serialised).not.toContain(STRONG);
    expect(serialised).not.toContain('password_hash');
    expect(serialised).not.toContain('http');
  });
});

describe('provider errors do not reach the caller verbatim', () => {
  it.each([
    ['same password', { message: 'New password should be different from the old password', code: 'same_password' }, COMPLETION_MESSAGES.samePassword],
    ['leaked password', { message: 'This password has been found in a data breach', status: 422 }, COMPLETION_MESSAGES.weak],
    ['too short', { message: 'Password should be at least 6 characters', status: 422 }, COMPLETION_MESSAGES.weak],
    ['an infrastructure fault', { message: 'connect ECONNREFUSED 10.0.0.1:5432' }, COMPLETION_MESSAGES.updateFailed],
  ])('maps %s onto our own sentence', async (_label, providerError, expected) => {
    const admin = buildAdmin({ updateError: providerError as never });
    const result = await completePasswordChange(admin as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_recovery',
      clearFlag: true, logPrefix: '[test]',
    });

    expect(result).toMatchObject({ ok: false, message: expected });
    expect(JSON.stringify(result)).not.toContain(providerError.message);
  });

  it('records the failed attempt', async () => {
    const admin = buildAdmin({ updateError: { message: 'nope', status: 422 } });
    await completePasswordChange(admin as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_forced',
      clearFlag: true, logPrefix: '[test]',
    });
    expect(admin.calls.audits[0]).toMatchObject({
      action: 'password_change_forced',
      outcome: 'failure',
    });
  });
});

describe('clearFlag: false', () => {
  it('a voluntary change touches no enforcement state', async () => {
    // A voluntary change is made by somebody who is NOT under the forced-change
    // regime. Clearing here would let this endpoint release an account the gate
    // is deliberately holding.
    const admin = buildAdmin();
    await completePasswordChange(admin as never, {
      userId: USER, newPassword: STRONG, auditAction: 'password_change_voluntary',
      clearFlag: false, logPrefix: '[test]',
    });

    expect(admin.calls.rpc).toEqual([]);
    expect(admin.calls.updateUserById).toHaveLength(1);
  });
});
