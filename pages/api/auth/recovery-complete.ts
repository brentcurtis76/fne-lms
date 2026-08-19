import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import {
  completeRecoveryPasswordChange,
  isCompletionFailure,
} from '../../../lib/auth/password-completion';

/**
 * Finish a password recovery — the first password after an invitation, and the
 * new password after a self-service "olvidé mi contraseña".
 *
 * ==========================================================================
 * WHAT THIS ENDPOINT NO LONGER ACCEPTS, which is the whole point of it.
 * ==========================================================================
 *
 * The previous version took `Authorization: Bearer <access token>`, called
 * `auth.getUser(token)`, and changed that account's password. `getUser` proves a
 * token is valid and says whose it is; it does not say what ceremony minted it.
 * An ordinary password login produces an indistinguishable token — so ANY
 * signed-in account could post its own access token here and set a new password
 * with no current password and no recovery link. That is the S12 defect
 * reappearing at the API boundary after being closed in the page.
 *
 * So this handler reads NO Authorization header and NO cookie. It has no notion
 * of a session at all. The only thing it accepts as identity is the one-time
 * `token_hash` this application itself put in the recovery e-mail, which
 * `lib/auth/recovery-proof.ts` consumes server-side with
 * `verifyOtp({ type: 'recovery' })`:
 *
 *   * purpose-bound  — the literal 'recovery' is ours, never the request's, so a
 *                      magic-link or confirmation hash cannot stand in;
 *   * one-time       — a replay of the same string fails at the auth server;
 *   * expiring       — on GoTrue's clock, not ours;
 *   * identity-bearing — the account is what GoTrue RETURNS. There is no user id
 *                      in the request for anything to redirect, and a signed-in
 *                      visitor who opens somebody else's link can only ever act
 *                      on the link's owner.
 *
 * Nothing here is logged: not the hash, not the address, not the password.
 */

// Recovery is auth-level traffic: 10 requests a minute per IP.
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-complete');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Note what is NOT read: req.headers.authorization, req.cookies, and any
    // `userId` the body might carry. The ceremony derives the account from the
    // material it consumes and from nothing else.
    const result = await completeRecoveryPasswordChange(createServiceRoleClient(), {
      tokenHash: body.tokenHash,
      type: body.type,
      newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
    });

    if (isCompletionFailure(result)) {
      return res.status(result.status).json({
        error: result.message,
        code: result.code,
        // The browser needs to know whether to offer "try again with a
        // different password" or "your password changed, sign in again".
        passwordChanged: result.passwordChanged,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      audited: result.audited,
    });
  } catch (error: any) {
    console.error('[recovery-complete] unexpected error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
