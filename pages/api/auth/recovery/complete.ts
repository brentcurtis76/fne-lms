import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../../lib/rateLimit';
import {
  completeRecoveryPasswordChange,
  isCompletionFailure,
} from '../../../../lib/auth/password-completion';
import {
  clearRecoveryGrantCookie,
  isSecureRequest,
  readRecoveryGrantCookie,
} from '../../../../lib/auth/recovery-cookie';

/**
 * Finish a password recovery — the first password after an invitation, and the
 * new password after a self-service "olvidé mi contraseña".
 *
 * ==========================================================================
 * WHAT THIS ENDPOINT ACCEPTS AS IDENTITY, and what it refuses.
 * ==========================================================================
 *
 * An earlier version took `Authorization: Bearer <access token>`, called
 * `auth.getUser(token)`, and changed that account's password. `getUser` proves a
 * token is valid and says whose it is; it does not say what ceremony minted it.
 * An ordinary password login produces an indistinguishable token — so ANY
 * signed-in account could post its own access token here and set a new password
 * with no current password and no recovery link. That is the S12 defect
 * reappearing at the API boundary after being closed in the page.
 *
 * So this handler reads NO Authorization header and no request-body identity of
 * any kind. The ONLY thing it accepts is the recovery-context cookie set by
 * `/api/auth/recovery/exchange` — an HttpOnly cookie carrying the opaque,
 * purpose-bound grant that endpoint minted after consuming the e-mailed
 * `token_hash` server-side with `verifyOtp({ type: 'recovery' })`:
 *
 *   * purpose-bound  — the literal 'recovery' is ours, never the request's, so a
 *                      magic-link or confirmation hash cannot stand in;
 *   * bounded        — five provider attempts and fifteen minutes;
 *   * retryable      — provider 422/5xx and RESOLVED network failures release
 *                      the lease; an AMBIGUOUS outcome closes the grant instead;
 *   * identity-bearing — the account is inside the grant's authenticated claims.
 *                      There is no user id in the request for anything to
 *                      redirect; a session cookie or bearer token placed in the
 *                      recovery cookie fails grant verification by shape.
 *
 * The cookie is CLEARED here on every terminal outcome — success, invalid,
 * expired, exhausted, interrupted — and kept only across retryable failures.
 *
 * Nothing here is logged: not the grant, not the address, not the password.
 */

// Recovery is auth-level traffic: 10 requests a minute per IP.
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-complete');

/** Failure codes after which the recovery context is unusable and must go. */
const TERMINAL_FAILURE_CODES = new Set([
  'RECOVERY_GRANT_INVALID',
  'RECOVERY_ATTEMPTS_EXHAUSTED',
  'RECOVERY_ATTEMPT_INTERRUPTED',
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const grant = readRecoveryGrantCookie(req);
    const secure = isSecureRequest(req);

    // Note what is NOT read: req.headers.authorization, any session cookie, and
    // any `userId` or `grant` the body might carry. The ceremony derives the
    // account from the server-managed cookie's grant and from nothing else.
    const result = await completeRecoveryPasswordChange(createServiceRoleClient(), {
      grant,
      newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
    });

    if (isCompletionFailure(result)) {
      if (result.code && TERMINAL_FAILURE_CODES.has(result.code)) {
        clearRecoveryGrantCookie(res, secure);
      }
      return res.status(result.status).json({
        error: result.message,
        code: result.code,
        // The browser needs to know whether to offer "try again with a
        // different password" or "your password changed, sign in again".
        passwordChanged: result.passwordChanged,
      });
    }

    clearRecoveryGrantCookie(res, secure);
    return res.status(200).json({
      success: true,
      message: result.message,
      audited: result.audited,
    });
  } catch {
    // Exception text may include provider/request material. The stable label is
    // sufficient for alerting without putting recovery data into application logs.
    console.error('[recovery-complete] unexpected failure');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
