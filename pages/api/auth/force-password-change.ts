import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import {
  completeForcedPasswordChange,
  isCompletionFailure,
} from '../../../lib/auth/password-completion';
import { clearAdministrativeResetMarker } from '../../../lib/auth/admin-user-maintenance';

/**
 * Complete a FORCED password change — the one a flagged account is held at
 * /change-password until it finishes.
 *
 * The defect this endpoint was raised for was that it was not on the path:
 * `/change-password` called `supabase.auth.updateUser({ password })` from the
 * browser first, and only came here if GoTrue answered 422. "Secure password
 * change" is off on this project, so 422 never arrives, so the ordinary forced
 * change went through the browser and this handler — with its server-side policy
 * check, its flag clear and its `password_change_forced` audit row — ran
 * essentially never.
 *
 * Everything that decides anything now lives in the trusted boundary
 * (`completeForcedPasswordChange`): the token is validated with the auth server
 * rather than decoded from a cookie, `must_change_password` must actually be TRUE
 * for that account before a password is written, the flag is cleared through the
 * trusted database path, and the audit action is derived from the ceremony rather
 * than named by this file. What is left here is HTTP.
 */

const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'force-password-change');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    const supabase = createPagesServerClient({ req, res });
    const admin = createServiceRoleClient();

    const result = await completeForcedPasswordChange(admin, supabase, {
      newPassword: typeof req.body?.newPassword === 'string' ? req.body.newPassword : '',
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
    const { error: metadataError } = await clearAdministrativeResetMarker(
      admin,
      result.userId
    );
    if (metadataError) {
      console.error('[force-password-change] could not clear the admin-reset marker', {
        user_id: result.userId,
        error: metadataError.message,
      });
    }

    return res.status(200).json({ success: true, audited: result.audited });
  } catch (error: any) {
    console.error('[force-password-change] unexpected error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
