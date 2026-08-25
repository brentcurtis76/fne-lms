/**
 * Recovery proof — the one-time, purpose-bound credential a password recovery
 * must consume, verified ON THE SERVER.
 *
 * ==========================================================================
 * WHAT WAS WRONG, and it is subtle enough to be worth spelling out.
 * ==========================================================================
 *
 * The previous round moved the password write to the server, which was right,
 * and then proved identity to that server with a BEARER ACCESS TOKEN, which was
 * not. `/reset-password` consumed the recovery material in the browser
 * (`verifyOtp`), took the access token that fell out of it, and posted that to
 * `/api/auth/recovery-complete`. The endpoint called `auth.getUser(token)` and
 * changed the named account's password.
 *
 * `getUser()` answers two questions -- is this token valid, and whose is it --
 * and it does not answer the one that matters here: WHAT CEREMONY MINTED IT. An
 * ordinary password login produces an access token that is indistinguishable, to
 * `getUser`, from one produced by a recovery link. So any signed-in account could
 * post its own access token to the recovery endpoint and set a new password with
 * no current password, no recovery link, and no reauthentication at all. That is
 * the S12 defect -- "any session satisfies the recovery form" -- reappearing one
 * layer down, at the API boundary, after being closed in the page.
 *
 * ==========================================================================
 * WHAT PROOF LOOKS LIKE NOW.
 * ==========================================================================
 *
 * The browser no longer consumes anything. It forwards the material from the URL
 * -- the `token_hash` this application itself put in the e-mail -- and THIS
 * module consumes it, server-side, with `verifyOtp({ type: 'recovery' })`.
 *
 * That single call carries every property the ceremony needs:
 *
 *   PURPOSE-BOUND   The literal `'recovery'` is passed by this module and is
 *                   never taken from the request. GoTrue refuses a hash minted
 *                   for any other flow, so a magic-link or e-mail-confirmation
 *                   token cannot stand in for a recovery token.
 *   ONE-TIME        GoTrue burns the hash. A replay of the same string fails.
 *   EXPIRING        An expired hash fails, on the auth server's clock, not ours.
 *   IDENTITY-BEARING The account is what GoTrue RETURNS. There is no user id in
 *                   the request for anything to redirect.
 *   NOT A SESSION   An access token is not a `token_hash` and does not verify as
 *                   one. There is no shape of ordinary session credential that
 *                   satisfies this call.
 *
 * The client used is created fresh, with the anon key, with no persisted session
 * and no URL detection -- so nothing about the calling process's state, or any
 * cookie the caller sent, can influence the answer.
 *
 * NOTHING SENSITIVE IS LOGGED. Not the hash, resulting tokens, address, or raw
 * provider wording. Operators get only stable labels and machine code/status.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** The only `type` this ceremony will act on. */
export const RECOVERY_TYPE = 'recovery' as const;

export type RecoveryProofFailure =
  /** No `token_hash` in the request at all. */
  | 'missing_material'
  /** The link declared a `type` that is not `recovery`. */
  | 'wrong_type'
  /** The Supabase environment is not configured on this server. */
  | 'not_configured'
  /** Expired, malformed, already consumed, replayed, or refused by GoTrue. */
  | 'invalid';

export type RecoveryProofSuccess = { ok: true; userId: string };
export type RecoveryProofRefusal = { ok: false; reason: RecoveryProofFailure };
export type RecoveryProofResult = RecoveryProofSuccess | RecoveryProofRefusal;

/**
 * A type guard rather than `if (!proof.ok)`: this project compiles with
 * `strict: false`, so truthiness narrowing on a discriminant does not apply and
 * the union would stay unnarrowed. Same reason `isCompletionFailure` exists.
 */
export function isRecoveryProofRefusal(
  result: RecoveryProofResult
): result is RecoveryProofRefusal {
  return result.ok === false;
}

export interface RecoveryMaterialInput {
  /** `properties.hashed_token` from `generateLink`, as carried in the e-mailed URL. */
  tokenHash?: unknown;
  /** The `type` query parameter the link carried, if any. */
  type?: unknown;
}

/**
 * A seam for tests. Production leaves it unset and gets a real anon client, so a
 * deployed build cannot reach a stub.
 */
export type RecoveryVerifierFactory = () => Pick<SupabaseClient, 'auth'>;

function defaultVerifierFactory(): RecoveryVerifierFactory | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return () =>
    createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
}

/**
 * Consume the recovery material and return the account it belongs to.
 *
 * Returns a reason, never the provider's wording: GoTrue distinguishes "expired"
 * from "already used" from "no such token", and telling an unauthenticated
 * caller which of those happened is an oracle. Every failure reads the same to
 * the browser.
 */
export async function consumeRecoveryProof(
  material: RecoveryMaterialInput,
  verifierFactory?: RecoveryVerifierFactory
): Promise<RecoveryProofResult> {
  const tokenHash = typeof material.tokenHash === 'string' ? material.tokenHash.trim() : '';
  if (!tokenHash) {
    return { ok: false, reason: 'missing_material' };
  }

  // A link with no `type` is the shape `buildRecoveryUrl` produces minus the
  // parameter; anything that names a DIFFERENT type is refused before the
  // provider is contacted, so a confirmation or magic-link hash never gets a
  // chance to be tried as recovery.
  const declaredType =
    material.type === undefined || material.type === null || material.type === ''
      ? RECOVERY_TYPE
      : material.type;
  if (declaredType !== RECOVERY_TYPE) {
    return { ok: false, reason: 'wrong_type' };
  }

  const factory = verifierFactory ?? defaultVerifierFactory();
  if (!factory) {
    console.error('[recovery-proof] Supabase environment is not configured');
    return { ok: false, reason: 'not_configured' };
  }

  const verifier = factory();

  let data: { user?: { id?: string | null } | null } | null = null;
  let error: { message?: string; code?: string; status?: number } | null = null;

  try {
    const response = await verifier.auth.verifyOtp({
      token_hash: tokenHash,
      // The literal, always. Never `declaredType`, never anything from the body.
      type: RECOVERY_TYPE,
    });
    data = (response?.data ?? null) as typeof data;
    error = (response?.error ?? null) as typeof error;
  } catch {
    console.warn('[recovery-proof] verifyOtp threw');
    return { ok: false, reason: 'invalid' };
  }

  if (error || !data?.user?.id) {
    console.warn('[recovery-proof] recovery material refused', {
      code: error?.code ?? null,
      status: error?.status ?? null,
      has_user: Boolean(data?.user?.id),
    });
    return { ok: false, reason: 'invalid' };
  }

  // The verification minted a session on this throwaway client. Nothing persists
  // it, and it is never returned to the caller, but discarding it explicitly
  // keeps the credential's lifetime as short as the operation that needed it.
  try {
    await (verifier.auth as { signOut?: (opts?: unknown) => Promise<unknown> }).signOut?.({
      scope: 'local',
    });
  } catch {
    // A failure to tidy up a session that was never persisted is not a failure
    // of the ceremony.
  }

  return { ok: true, userId: data.user.id };
}
