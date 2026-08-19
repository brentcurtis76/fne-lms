// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimRecoveryGrant,
  exchangeRecoveryProofForGrant,
  finishRecoveryGrantAttempt,
  RECOVERY_GRANT_MARKER,
} from '../../../lib/auth/recovery-grant';
import { verifyRecoveryGrant } from '../../../lib/auth/recovery-crypto';

const SECRET = 'synthetic-service-role-secret-that-is-long-enough-2026';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '99999999-9999-4999-8999-999999999999';
const PROOF = 'one-time-provider-proof';

function verifier(userId = USER_ID) {
  return () => ({
    auth: {
      verifyOtp: vi.fn(async () => ({
        data: { user: { id: userId }, session: { access_token: 'synthetic' } },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  });
}

function adminForClaim(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
  marker?: string
) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { id: USER_ID, user_metadata: marker ? { [RECOVERY_GRANT_MARKER]: marker } : {} } },
          error: null,
        })),
      },
    },
    rpc: vi.fn(rpc),
  } as any;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('proof exchange', () => {
  it('consumes recovery proof and persists only a grant hash plus bounds', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { rpc } as any;
    const result = await exchangeRecoveryProofForGrant(
      admin,
      { tokenHash: PROOF, type: 'recovery' },
      { verifierFactory: verifier() as never, secret: SECRET }
    );
    expect(result.ok).toBe(true);
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpc.mock.calls[0][0]).toBe('create_recovery_attempt_grant');
    expect(args.p_grant_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain(PROOF);
    expect(JSON.stringify(args)).not.toContain(USER_ID);
    expect(JSON.stringify(args)).not.toContain((result as any).grant);
  });

  it('rejects the wrong purpose before creating durable state', async () => {
    const rpc = vi.fn();
    const result = await exchangeRecoveryProofForGrant(
      { rpc } as any,
      { tokenHash: PROOF, type: 'magiclink' },
      { verifierFactory: verifier() as never, secret: SECRET }
    );
    expect(result).toEqual({ ok: false, reason: 'invalid_proof' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('attempt leases', () => {
  async function issuedGrant() {
    const result = await exchangeRecoveryProofForGrant(
      { rpc: vi.fn(async () => ({ data: true, error: null })) } as any,
      { tokenHash: PROOF, type: 'recovery' },
      { verifierFactory: verifier() as never, secret: SECRET }
    );
    if (!result.ok) throw new Error('synthetic grant setup failed');
    return result.grant;
  }

  it('returns the encrypted subject after an atomic claim', async () => {
    const grant = await issuedGrant();
    const admin = adminForClaim(async (name) => ({
      data: name === 'claim_recovery_attempt_grant'
        ? [{ status: 'claimed', attempts_remaining: 4 }]
        : true,
      error: null,
    }));
    const result = await claimRecoveryGrant(admin, grant, { secret: SECRET });
    expect(result).toMatchObject({ ok: true, claims: { subject: USER_ID }, attemptsRemaining: 4 });
  });

  it('allows only one of two simultaneous workers to claim', async () => {
    const grant = await issuedGrant();
    let claimed = false;
    const admin = adminForClaim(async (name) => {
      if (name !== 'claim_recovery_attempt_grant') return { data: true, error: null };
      if (claimed) return { data: [{ status: 'busy', attempts_remaining: 4 }], error: null };
      claimed = true;
      return { data: [{ status: 'claimed', attempts_remaining: 4 }], error: null };
    });
    const results = await Promise.all([
      claimRecoveryGrant(admin, grant, { secret: SECRET }),
      claimRecoveryGrant(admin, grant, { secret: SECRET }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === 'busy')).toHaveLength(1);
  });

  it.each(['expired', 'exhausted', 'busy', 'succeeded'] as const)(
    'maps durable %s state without returning a subject',
    async (status) => {
      const grant = await issuedGrant();
      const admin = adminForClaim(async () => ({ data: [{ status }], error: null }));
      expect(await claimRecoveryGrant(admin, grant, { secret: SECRET })).toEqual({
        ok: false,
        reason: status,
      });
    }
  );

  it('uses the provider-side success marker to close a lost-commit replay window', async () => {
    const grant = await issuedGrant();
    const verified = verifyRecoveryGrant(grant, { secret: SECRET });
    if (!verified.ok) throw new Error('synthetic verification failed');
    const admin = adminForClaim(
      async (name) => ({ data: name === 'mark_recovery_attempt_grant_succeeded', error: null }),
      verified.grantHash
    );
    expect(await claimRecoveryGrant(admin, grant, { secret: SECRET })).toEqual({
      ok: false,
      reason: 'succeeded',
    });
    expect(admin.rpc).not.toHaveBeenCalledWith('claim_recovery_attempt_grant', expect.anything());
  });

  it('rejects grant tampering/cross-account substitution before provider or database access', async () => {
    const grant = await issuedGrant();
    const admin = adminForClaim(async () => ({ data: null, error: null }));
    expect(await claimRecoveryGrant(admin, `${grant}.${OTHER_USER}`, { secret: SECRET })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('finishes a lease as retryable or succeeded without exposing the grant', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { rpc } as any;
    const claim = {
      ok: true as const,
      claims: { purpose: 'password_recovery' as const, subject: USER_ID, nonce: 'n', issuedAt: 1, expiresAt: 2 },
      grantHash: 'a'.repeat(64),
      leaseToken: '22222222-2222-4222-8222-222222222222',
      attemptsRemaining: 4,
    };
    expect(await finishRecoveryGrantAttempt(admin, claim, false)).toBe(true);
    expect(await finishRecoveryGrantAttempt(admin, claim, true)).toBe(true);
    expect(rpc.mock.calls.map((call) => call[1].p_succeeded)).toEqual([false, true]);
  });
});
