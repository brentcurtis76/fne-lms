import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createServiceRoleClient } from '../../../lib/api-auth';

/**
 * Whether the CALLING account still owes a forced password change, and whether
 * an administrator is the reason.
 *
 * WHY IT EXISTS. `/change-password` used to answer both questions from the
 * browser: a `profiles` SELECT for the flag, and `session.user.user_metadata`
 * for the administrative-reset banner. Neither works now, and neither should
 * have been trusted before:
 *
 *   - The database gate added in `20260819120000` refuses every PostgREST
 *     request from a flagged account. That is the point of it — but it means the
 *     page cannot read its own profile row, which is the state it needs.
 *   - `user_metadata` is decoded from a cookie. It is the caller's to rewrite,
 *     so a banner (or, worse, a decision) taken from it is taken from the user.
 *
 * So the page asks the server, and the server asks with a service-role client
 * after establishing who is calling via `auth.getUser()` — a round trip that
 * validates the token rather than decoding it.
 *
 * It reads only the caller's own row and returns two booleans. There is no
 * parameter, so there is nothing to point at another account.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // getUser, not getSession: the latter returns whatever the cookie decodes to.
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const admin = createServiceRoleClient();

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[password-change-state] profile read failed', {
        user_id: user.id,
        error: profileError.message,
      });
      // Distinguishable from "not required" on purpose: the page renders a retry
      // panel for this, and would render the dashboard redirect for the other.
      return res.status(503).json({
        error: 'No pudimos verificar el estado de tu cuenta.',
        code: 'PASSWORD_STATE_UNAVAILABLE',
      });
    }

    // The administrative-reset banner. Read from the auth record on the server
    // rather than from the client's copy of its own metadata.
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    const metadata = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;

    return res.status(200).json({
      mustChangePassword: profile?.must_change_password === true,
      isAdminReset: metadata.password_reset_by_admin === true,
    });
  } catch (error: any) {
    console.error('[password-change-state] unexpected error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
