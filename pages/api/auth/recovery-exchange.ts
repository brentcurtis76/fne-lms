import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import { exchangeRecoveryProofForGrant } from '../../../lib/auth/recovery-grant';
import { COMPLETION_MESSAGES } from '../../../lib/auth/password-completion';

const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-exchange');

/** Exchange the e-mailed one-time proof for a short-lived bounded retry grant. */
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
      const serverFailure = result.reason === 'not_configured' || result.reason === 'store_failed';
      return res.status(serverFailure ? 503 : 401).json({
        error: serverFailure
          ? COMPLETION_MESSAGES.serverError
          : COMPLETION_MESSAGES.recoveryInvalid,
        code: serverFailure ? 'RECOVERY_GRANT_UNAVAILABLE' : 'RECOVERY_MATERIAL_INVALID',
      });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ grant: result.grant, expiresAt: result.expiresAt });
  } catch {
    console.error('[recovery-exchange] unexpected failure');
    return res.status(500).json({ error: COMPLETION_MESSAGES.serverError });
  }
}
