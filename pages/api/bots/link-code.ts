// Generates a one-time code so a logged-in user can link their Telegram
// account to the expense bot. Same access rule as the bot itself:
// expense_report_access.can_submit OR active admin.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient, getApiUser, sendAuthError } from '../../../lib/api-auth';
import { hasAdminPrivileges } from '../../../utils/roleUtils';
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

    const { data: access, error: accessError } = await supabase
      .from('expense_report_access')
      .select('can_submit')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accessError) throw accessError;

    let allowed = !!(access as { can_submit: boolean } | null)?.can_submit;
    if (!allowed) {
      allowed = await hasAdminPrivileges(supabase, user.id);
    }
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
