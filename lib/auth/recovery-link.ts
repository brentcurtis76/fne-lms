/**
 * The recovery URL this application sends.
 *
 * F2 — WHAT WAS WRONG. Invitations e-mailed `generateLink().properties.action_link`:
 * the PROVIDER'S url, which points at `{SUPABASE_URL}/auth/v1/verify?token=…&type=recovery&redirect_to=…`.
 * Supabase consumes the token there and bounces the browser to `/reset-password`
 * carrying whatever shape that project's configuration produces — an
 * `#access_token=…` fragment for an implicit project, `?code=…` for a PKCE one.
 * Three consequences, all of them bad:
 *
 *   1. The application had no idea which shape would arrive, so `/reset-password`
 *      had to support all of them, including the legacy fragment branch that
 *      turned out to be the hole.
 *   2. The shape depended on a dashboard setting nobody on this project has ever
 *      deliberately chosen, so it could change under the application without a
 *      code change.
 *   3. The mandatory e2e could not open the link the product actually sends. It
 *      hand-built `?token_hash=…` instead — a DIFFERENT format — so the one test
 *      that was supposed to prove the invitation chain connects was proving it
 *      for a URL nobody was ever sent.
 *
 * WHAT REPLACES IT. `generateLink` also returns `properties.hashed_token`, which
 * is the same one-time credential without the provider's redirect wrapper around
 * it. We build the URL ourselves:
 *
 *     {origin}/reset-password?token_hash={hashed_token}&type=recovery
 *
 * The link now lands directly on this application's own page, in exactly one
 * known format, which `/reset-password` verifies with `verifyOtp`. There is no
 * provider redirect in the middle, no implicit fragment, and no ambiguity — and
 * the e2e opens the very string that was placed in the message.
 *
 * The token never leaves this module's callers except into the mailer. It is not
 * returned to any HTTP response, not logged, and not written to the audit trail
 * (where the storage-layer CHECK would refuse it anyway).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type RecoveryLinkSuccess = { ok: true; url: string };
export type RecoveryLinkRefusal = {
  ok: false;
  reason: 'generate_failed' | 'no_hashed_token';
};
export type RecoveryLinkResult = RecoveryLinkSuccess | RecoveryLinkRefusal;

/** A guard, not truthiness: this project compiles with `strict: false`. */
export function isRecoveryLinkRefusal(
  result: RecoveryLinkResult
): result is RecoveryLinkRefusal {
  return result.ok === false;
}

/**
 * Build the application's own recovery URL from a hashed token.
 *
 * Exported separately so it can be asserted on directly: the format is a
 * contract between `lib/email/invitations.ts`, `pages/reset-password.tsx` and
 * `tests/e2e/auth-lifecycle.spec.ts`, and a silent change to it breaks the
 * invitation chain in a way only a full run would notice.
 */
export function buildRecoveryUrl(baseUrl: string, hashedToken: string): string {
  const origin = baseUrl.replace(/\/+$/, '');
  return `${origin}/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
}

/**
 * Mint a FRESH recovery link for an address.
 *
 * A recovery credential is one-time and expiring, so there is no such thing as
 * "re-sending the previous link" — every call mints a new one and the previous
 * one stops working. That is the correct behaviour for a credential-bearing URL,
 * and `pages/api/admin/tractor-signups/resend-invite.ts` depends on it.
 *
 * `redirectTo` is still passed to the provider even though we do not use the
 * link it builds: Supabase validates it against the project's redirect
 * allow-list, so passing the real destination keeps that check meaningful.
 */
export async function generateRecoveryLink(
  admin: Pick<SupabaseClient, 'auth'>,
  params: { email: string; baseUrl: string }
): Promise<RecoveryLinkResult> {
  const redirectTo = `${params.baseUrl.replace(/\/+$/, '')}/reset-password`;

  const { data, error } = await (admin as SupabaseClient).auth.admin.generateLink({
    type: 'recovery',
    email: params.email,
    options: { redirectTo },
  });

  if (error) {
    // Only the provider's message, and only to the operator log. No token, no
    // address, no URL.
    console.error('[recovery-link] generateLink failed', { error: error.message });
    return { ok: false, reason: 'generate_failed' };
  }

  const hashedToken = (data?.properties as { hashed_token?: string } | undefined)?.hashed_token;

  if (!hashedToken) {
    console.error('[recovery-link] generateLink returned no hashed_token');
    return { ok: false, reason: 'no_hashed_token' };
  }

  return { ok: true, url: buildRecoveryUrl(params.baseUrl, hashedToken) };
}
