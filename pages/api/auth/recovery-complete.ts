import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import {
  completePasswordChange,
  isCompletionFailure,
} from '../../../lib/auth/password-completion';

/**
 * Finish a password recovery — the first password after an invitation, and the
 * new password after a self-service "olvidé mi contraseña".
 *
 * F3 — WHY THIS ENDPOINT EXISTS. `/reset-password` used to do all of this in the
 * browser: `supabase.auth.updateUser({ password })`, then a browser PATCH to
 * clear `profiles.must_change_password`, then "Contraseña actualizada
 * exitosamente" regardless of whether the second write landed. The shared
 * password policy was checked only by the form. And the whole flow — the single
 * most security-relevant event an account has — wrote no audit row at all,
 * because there was no action for it.
 *
 * HOW IDENTITY IS ESTABLISHED, which is the only interesting thing here. The
 * caller sends the access token minted by the recovery credential it just
 * verified, as `Authorization: Bearer <token>`. This handler hands that token to
 * `auth.getUser(token)`, which is a round trip to GoTrue that validates the
 * signature, the expiry and the revocation state and returns the account it
 * belongs to.
 *
 * That is the whole point. It is NOT `getSession()`, which merely decodes a
 * cookie the caller can rewrite; it is NOT a user id from the request body,
 * which the caller chooses. The account whose password changes is the account
 * GoTrue names, so:
 *
 *   - a forged or expired token is refused by the auth server, not by us;
 *   - a signed-in visitor who opens somebody ELSE'S recovery link can only ever
 *     act on the link's owner, because the bearer token came from the link;
 *   - and no request body field can redirect the write onto a third account,
 *     because there is no such field.
 *
 * The token is never logged, never echoed and never stored. It arrives in a
 * header, is used once, and goes out of scope.
 */

// Recovery is auth-level traffic: 10 requests a minute per IP.
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-complete');

function bearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Tu sesión de recuperación expiró. Solicita un enlace de recuperación nuevo.',
      code: 'NO_RECOVERY_TOKEN',
    });
  }

  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!newPassword) {
    return res.status(400).json({ error: 'La nueva contraseña es obligatoria' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('[recovery-complete] Supabase environment is not configured');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  try {
    // Verify the recovery token AGAINST THE AUTH SERVER. A fresh client with no
    // persisted session, so nothing about this process's state can influence the
    // answer.
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const { data: verified, error: verifyError } = await verifier.auth.getUser(token);

    if (verifyError || !verified?.user?.id) {
      // The provider's wording distinguishes expired from malformed from
      // revoked. The caller gets one sentence for all three.
      console.warn('[recovery-complete] recovery token rejected', {
        reason: verifyError?.message ?? 'no user on token',
      });
      return res.status(401).json({
        error: 'Tu sesión de recuperación expiró. Solicita un enlace de recuperación nuevo.',
        code: 'RECOVERY_TOKEN_INVALID',
      });
    }

    const userId = verified.user.id;
    const admin = createServiceRoleClient();

    const result = await completePasswordChange(admin, {
      userId,
      newPassword,
      auditAction: 'password_change_recovery',
      auditMetadata: { change_type: 'recovery_link' },
      clearFlag: true,
      logPrefix: '[recovery-complete]',
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
