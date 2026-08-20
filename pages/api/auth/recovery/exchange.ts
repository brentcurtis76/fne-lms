import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../../lib/rateLimit';
import {
  exchangeRecoveryProofForGrant,
  RECOVERY_GRANT_TTL_SECONDS,
} from '../../../../lib/auth/recovery-grant';
import { COMPLETION_MESSAGES } from '../../../../lib/auth/password-completion';
import {
  isSecureRequest,
  setRecoveryGrantCookie,
} from '../../../../lib/auth/recovery-cookie';

const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-exchange');

/**
 * THE UNAVOIDABLE EXTERNAL PROOF-CONSUMPTION BOUNDARY, stated honestly: the
 * one-time e-mailed proof is burned at the auth provider BEFORE the grant can
 * be durably stored here, and the two systems share no transaction. If the
 * grant store then fails, the proof is gone and nothing can un-burn it — the
 * only truthful answer is "request a new link", which is exactly what the
 * `store_failed` branch says. It does NOT claim the failure is retryable.
 */
export const EXCHANGE_STORE_FAILED_MESSAGE =
  'Por seguridad, el enlace ya fue utilizado, pero no pudimos preparar la recuperación. ' +
  'Solicita un enlace nuevo desde la página de inicio de sesión.';

/**
 * Exchange the e-mailed one-time proof for a short-lived bounded retry grant.
 *
 * The grant NEVER travels in the response body. It is stored in an HttpOnly,
 * SameSite=Strict cookie scoped to `/api/auth/recovery`, so the exchanged
 * recovery context survives page refresh and tab remount without any script —
 * this page's included — ever holding the credential.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await exchangeRecoveryProofForGrant(createServiceRoleClient(), {
      tokenHash: body.tokenHash,
      type: body.type,
    });

    if (result.ok === false) {
      if (result.reason === 'store_failed') {
        return res.status(503).json({
          error: EXCHANGE_STORE_FAILED_MESSAGE,
          code: 'RECOVERY_GRANT_UNAVAILABLE',
        });
      }
      const serverFailure = result.reason === 'not_configured';
      return res.status(serverFailure ? 503 : 401).json({
        error: serverFailure
          ? COMPLETION_MESSAGES.serverError
          : COMPLETION_MESSAGES.recoveryInvalid,
        code: serverFailure ? 'RECOVERY_GRANT_UNAVAILABLE' : 'RECOVERY_MATERIAL_INVALID',
      });
    }

    setRecoveryGrantCookie(res, result.grant, RECOVERY_GRANT_TTL_SECONDS, isSecureRequest(req));
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ ok: true, expiresAt: result.expiresAt });
  } catch {
    console.error('[recovery-exchange] unexpected failure');
    return res.status(500).json({ error: COMPLETION_MESSAGES.serverError });
  }
}
