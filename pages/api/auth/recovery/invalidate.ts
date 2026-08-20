import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../../lib/rateLimit';
import { invalidateRecoveryGrant } from '../../../../lib/auth/recovery-grant';
import {
  clearRecoveryGrantCookie,
  isSecureRequest,
  readRecoveryGrantCookie,
} from '../../../../lib/auth/recovery-cookie';

const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-invalidate');

/**
 * Explicit invalidation: the holder abandoned the recovery ceremony. The
 * durable grant is closed terminally and the recovery-context cookie is
 * cleared. Idempotent — invalidating an absent or already-closed context is a
 * success, because the desired end state holds either way.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    const grant = readRecoveryGrantCookie(req);
    if (grant) {
      await invalidateRecoveryGrant(createServiceRoleClient(), grant);
    }
    clearRecoveryGrantCookie(res, isSecureRequest(req));
    return res.status(200).json({ ok: true });
  } catch {
    console.error('[recovery-invalidate] unexpected failure');
    clearRecoveryGrantCookie(res, isSecureRequest(req));
    return res.status(200).json({ ok: true });
  }
}
