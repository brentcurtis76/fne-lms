import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../../lib/rateLimit';
import { peekRecoveryGrant } from '../../../../lib/auth/recovery-grant';
import {
  clearRecoveryGrantCookie,
  isSecureRequest,
  readRecoveryGrantCookie,
} from '../../../../lib/auth/recovery-cookie';

const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-context');

/**
 * Does this browser hold a usable recovery context? Consumes NOTHING: the peek
 * is read-only, so a refresh or tab remount can re-open the form without
 * spending one of the grant's bounded attempts.
 *
 * The answer is a plain boolean about the caller's OWN cookie. It discloses no
 * account fact: a visitor without the cookie simply has no context, exactly
 * like a visitor whose context expired.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const grant = readRecoveryGrantCookie(req);
    if (!grant) {
      return res.status(200).json({ active: false });
    }

    const status = await peekRecoveryGrant(createServiceRoleClient(), grant);
    if (status === 'active') {
      return res.status(200).json({ active: true });
    }
    if (status === 'unavailable') {
      // The database could not answer. Do not destroy a context that may still
      // be alive; the form will learn the truth on submit.
      return res.status(503).json({ error: 'Error interno del servidor' });
    }

    clearRecoveryGrantCookie(res, isSecureRequest(req));
    return res.status(200).json({ active: false });
  } catch {
    console.error('[recovery-context] unexpected failure');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
