import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
} from '../../../lib/api-auth';
import { notifyWorkspaceMessage } from '../../../lib/services/workspace-message-notifications';

/**
 * /api/community/workspace-message-notifications — mention and reply bells for
 * a saved workspace message (utils/messagingUtils-simple.ts `sendMessage`, after
 * the insert). The caller supplies the message id, its workspace id and the
 * users the composer says it mentioned; the audience is re-derived from the
 * saved rows (lib/services/workspace-message-notifications.ts). Calling again
 * for the same message creates only the bells still missing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MENTIONS = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { user, error: authError } = await getApiUser(req, res);
    if (authError || !user) {
      return res.status(401).json({ error: 'Debes iniciar sesión' });
    }

    const serviceClient = createServiceRoleClient();

    const verdict = await getForcedPasswordChangeVerdict(serviceClient, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    const { message_id: messageId, workspace_id: workspaceId, mentioned_user_ids: mentions = [] } = req.body ?? {};
    if (
      typeof messageId !== 'string' || !UUID.test(messageId) ||
      typeof workspaceId !== 'string' || !UUID.test(workspaceId) ||
      !Array.isArray(mentions) || mentions.length > MAX_MENTIONS ||
      !mentions.every((id: unknown) => typeof id === 'string' && UUID.test(id))
    ) {
      return res.status(400).json({ error: 'Identificadores inválidos' });
    }

    const outcome = await notifyWorkspaceMessage(serviceClient, user.id, {
      messageId: messageId.toLowerCase(),
      workspaceId: workspaceId.toLowerCase(),
      mentionedUserIds: mentions,
    });
    return res.status(outcome.status).json(outcome.body);
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[community/workspace-message-notifications] unexpected error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
