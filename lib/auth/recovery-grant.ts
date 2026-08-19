/**
 * Exchange a one-time recovery proof for a bounded retry grant, then lease each
 * provider attempt atomically. The database stores only the grant hash.
 */
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  consumeRecoveryProof,
  isRecoveryProofRefusal,
  type RecoveryMaterialInput,
  type RecoveryVerifierFactory,
} from './recovery-proof';
import {
  issueRecoveryGrant,
  verifyRecoveryGrant,
  type RecoveryGrantClaims,
} from './recovery-crypto';

export const RECOVERY_GRANT_TTL_SECONDS = 15 * 60;
export const RECOVERY_GRANT_MAX_ATTEMPTS = 5;
export const RECOVERY_GRANT_LEASE_SECONDS = 45;
export const RECOVERY_GRANT_MARKER = 'last_recovery_grant_hash';

export type RecoveryGrantExchangeResult =
  | { ok: true; grant: string; expiresAt: string }
  | { ok: false; reason: 'invalid_proof' | 'not_configured' | 'store_failed' };

export type RecoveryGrantClaimResult =
  | {
      ok: true;
      claims: RecoveryGrantClaims;
      grantHash: string;
      leaseToken: string;
      attemptsRemaining: number;
    }
  | {
      ok: false;
      reason: 'invalid' | 'expired' | 'exhausted' | 'busy' | 'succeeded' | 'unavailable';
    };

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

export async function exchangeRecoveryProofForGrant(
  admin: SupabaseClient,
  material: RecoveryMaterialInput,
  options: {
    verifierFactory?: RecoveryVerifierFactory;
    now?: Date;
    secret?: string;
    ttlSeconds?: number;
    maxAttempts?: number;
  } = {}
): Promise<RecoveryGrantExchangeResult> {
  const proof = await consumeRecoveryProof(material, options.verifierFactory);
  if (isRecoveryProofRefusal(proof)) {
    return {
      ok: false,
      reason: proof.reason === 'not_configured' ? 'not_configured' : 'invalid_proof',
    };
  }

  let issued: ReturnType<typeof issueRecoveryGrant>;
  try {
    issued = issueRecoveryGrant(proof.userId, {
      now: options.now,
      ttlSeconds: options.ttlSeconds ?? RECOVERY_GRANT_TTL_SECONDS,
      secret: options.secret,
    });
  } catch {
    console.error('[recovery-grant] grant cryptography is not configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { data, error } = await admin.rpc('create_recovery_attempt_grant', {
      p_grant_hash: issued.grantHash,
      p_expires_at: issued.expiresAt,
      p_max_attempts: options.maxAttempts ?? RECOVERY_GRANT_MAX_ATTEMPTS,
    });
    if (error || data !== true) {
      console.error('[recovery-grant] durable grant creation failed', {
        code: (error as { code?: string } | null)?.code ?? null,
      });
      return { ok: false, reason: 'store_failed' };
    }
  } catch {
    console.error('[recovery-grant] durable grant creation threw');
    return { ok: false, reason: 'store_failed' };
  }

  return { ok: true, grant: issued.grant, expiresAt: issued.expiresAt };
}

/**
 * Claim one provider attempt. Before taking a database lease, consult the
 * provider-side marker written atomically with the password. This closes the
 * distributed-transaction gap where the provider accepted the password but the
 * subsequent database completion RPC was lost.
 */
export async function claimRecoveryGrant(
  admin: SupabaseClient,
  grant: unknown,
  options: { now?: Date; secret?: string; leaseToken?: string } = {}
): Promise<RecoveryGrantClaimResult> {
  const verified = verifyRecoveryGrant(grant, options);
  if (verified.ok === false) {
    return {
      ok: false,
      reason:
        verified.reason === 'expired'
          ? 'expired'
          : verified.reason === 'not_configured'
            ? 'unavailable'
            : 'invalid',
    };
  }

  try {
    const { data: providerUser, error: providerError } =
      await admin.auth.admin.getUserById(verified.claims.subject);
    if (providerError) {
      console.error('[recovery-grant] provider marker lookup failed', {
        code: (providerError as { code?: string }).code ?? null,
        status: (providerError as { status?: number }).status ?? null,
      });
      return { ok: false, reason: 'unavailable' };
    }

    const marker = (providerUser?.user?.user_metadata as Record<string, unknown> | undefined)?.[
      RECOVERY_GRANT_MARKER
    ];
    if (marker === verified.grantHash) {
      await admin.rpc('mark_recovery_attempt_grant_succeeded', {
        p_grant_hash: verified.grantHash,
      });
      return { ok: false, reason: 'succeeded' };
    }
  } catch {
    console.error('[recovery-grant] provider marker lookup threw');
    return { ok: false, reason: 'unavailable' };
  }

  const leaseToken = options.leaseToken ?? randomUUID();
  try {
    const { data, error } = await admin.rpc('claim_recovery_attempt_grant', {
      p_grant_hash: verified.grantHash,
      p_lease_token: leaseToken,
      p_lease_seconds: RECOVERY_GRANT_LEASE_SECONDS,
    });
    if (error) {
      console.error('[recovery-grant] durable claim failed', {
        code: (error as { code?: string }).code ?? null,
      });
      return { ok: false, reason: 'unavailable' };
    }

    const row = firstRow(data);
    const status = row?.status;
    if (status !== 'claimed') {
      if (status === 'expired' || status === 'exhausted' || status === 'busy' || status === 'succeeded') {
        return { ok: false, reason: status };
      }
      return { ok: false, reason: 'invalid' };
    }

    return {
      ok: true,
      claims: verified.claims,
      grantHash: verified.grantHash,
      leaseToken,
      attemptsRemaining:
        typeof row?.attempts_remaining === 'number' ? row.attempts_remaining : 0,
    };
  } catch {
    console.error('[recovery-grant] durable claim threw');
    return { ok: false, reason: 'unavailable' };
  }
}

export async function finishRecoveryGrantAttempt(
  admin: SupabaseClient,
  claim: Extract<RecoveryGrantClaimResult, { ok: true }>,
  succeeded: boolean
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('finish_recovery_attempt_grant', {
      p_grant_hash: claim.grantHash,
      p_lease_token: claim.leaseToken,
      p_succeeded: succeeded,
    });
    if (error || data !== true) {
      console.error('[recovery-grant] durable completion failed', {
        code: (error as { code?: string } | null)?.code ?? null,
      });
      return false;
    }
    return true;
  } catch {
    console.error('[recovery-grant] durable completion threw');
    return false;
  }
}
