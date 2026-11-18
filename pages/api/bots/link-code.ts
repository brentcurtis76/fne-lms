// Generates a one-time code so a logged-in user can link their Telegram
// account to the expense bot. Same access rule as the bot itself: an active
// admin, consultor or community_manager (lib/expenses/access.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, getApiUser, sendAuthError } from '../../../lib/api-auth';
import { canFileExpenses } from '../../../lib/expenses/access';
import { BotStore } from '../../../lib/bots/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'No autorizado', 401);
  }

  try {
    const supabase = createServiceRoleClient();

    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (rolesError) throw rolesError;

    const allowed = canFileExpenses(
      ((roles as Array<{ role_type: string }> | null) ?? []).map((r) => r.role_type)
    );
    if (!allowed) {
      return sendAuthError(res, 'No tienes acceso a rendición de gastos', 403);
    }

    const store = new BotStore(supabase);
    const code = await store.createLinkCode(user.id);
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

    return res.status(200).json({
      code,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
      expiresInMinutes: 15
    });
  } catch (err) {
    console.error('[Bot] link-code generation failed:', err);
    return res.status(500).json({ error: 'Error generando el código' });
  }
}
