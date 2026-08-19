import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import {
  completePasswordChange,
  isCompletionFailure,
} from '../../../lib/auth/password-completion';

/**
 * Complete a FORCED password change — the one a flagged account is held at
 * /change-password until it finishes.
 *
 * F3 — WHAT CHANGED. This endpoint already existed and already did most of the
 * right things. The defect was that it was not on the path: `/change-password`
 * called `supabase.auth.updateUser({ password })` from the browser first, and
 * only came here if GoTrue answered 422. "Secure password change" is off on this
 * project, so 422 never arrives, so the ordinary forced change went through the
 * browser and this handler — with its server-side policy check, its flag clear
 * and its `password_change_forced` audit row — ran essentially never.
 *
 * The page now posts here unconditionally. Three further corrections while it
 * was open:
 *
 *   `auth.getUser()` REPLACES `auth.getSession()`. getSession decodes the
 *   cookie; getUser validates the token with the auth server. The account this
 *   handler is about to write a password for should be one the auth server
 *   names, not one a cookie claims.
 *
 *   THE FLAG CLEAR GOES THROUGH `set_password_change_required()`, the trusted
 *   database path, which returns whether a row was actually updated. The old
 *   `.update().eq()` could not tell "cleared" from "matched nothing".
 *
 *   THE PROVIDER'S ERROR NO LONGER REACHES THE CALLER. It used to be thrown and
 *   re-serialised into `details`, which handed GoTrue's own wording — including
 *   its leaked-password verdict — to the browser.
 */

const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'force-password-change');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const admin = createServiceRoleClient();

    // The flag really must be set. This endpoint bypasses GoTrue's own
    // reauthentication requirement (it writes with the service role), so it must
    // not become a general "change my password without knowing it" route for an
    // account that is not under the forced-change regime.
    //
    // Read with the SERVICE-ROLE client: the caller is by definition flagged, so
    // a user-scoped read of their own profile is exactly what the database gate
    // refuses.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[force-password-change] profile read failed', {
        user_id: user.id,
        error: profileError.message,
      });
      return res.status(503).json({
        error: 'No pudimos verificar el estado de tu cuenta. Inténtalo nuevamente en unos momentos.',
        code: 'PASSWORD_STATE_UNAVAILABLE',
      });
    }

    if (profile?.must_change_password !== true) {
      return res.status(403).json({
        error: 'Password change not required for this user',
        code: 'CHANGE_NOT_REQUIRED',
      });
    }

    const result = await completePasswordChange(admin, {
      userId: user.id,
      newPassword,
      auditAction: 'password_change_forced',
      auditMetadata: { change_type: 'forced_first_login' },
      clearFlag: true,
      logPrefix: '[force-password-change]',
    });

    if (isCompletionFailure(result)) {
      return res.status(result.status).json({
        error: result.message,
        code: result.code,
        passwordChanged: result.passwordChanged,
      });
    }

    // Clear the administrative-reset marker so the banner does not persist into
    // the next forced change. Best-effort and deliberately last: it is cosmetic,
    // and it must not be able to fail the operation that already succeeded.
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { password_reset_by_admin: null, password_reset_at: null },
    });
    if (metadataError) {
      console.error('[force-password-change] could not clear the admin-reset marker', {
        user_id: user.id,
        error: metadataError.message,
      });
    }

    return res.status(200).json({ success: true, audited: result.audited });
  } catch (error: any) {
    console.error('[force-password-change] unexpected error:', error?.message ?? error);
    return res.status(500).json({ error: 'Failed to update password' });
  }
}
