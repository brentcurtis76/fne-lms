import { NextApiRequest, NextApiResponse } from 'next';
import NotificationService from '../../../lib/notificationService';
import {
  getApiUser,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
} from '../../../lib/api-auth';

/**
 * /api/messaging/send — saves a workspace message and notifies its recipient.
 *
 * The sender is always the authenticated caller. The service-role write and the
 * notification happen only when the recipient is inside the sender's scope:
 *
 *   * with `thread_id`: the thread exists and both users can access its
 *     workspace (can_access_workspace);
 *   * without it: both users hold an active role in the same community or school.
 *
 * The message `context` is derived here, not taken from the caller. The
 * notification is generic and points at the saved message: the body, subject
 * and any caller-supplied context never reach the notification, the e-mail or
 * a log. `notification_sent` is set only when a notification was created.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SUBJECT_LENGTH = 255;

type ScopeRole = { user_id: string; school_id: string | number | null; community_id: string | null };

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

    const { recipient_id: recipientId, content, subject, thread_id: threadId } = req.body ?? {};
    if (typeof recipientId !== 'string' || !UUID.test(recipientId)) {
      return res.status(400).json({ error: 'Destinatario inválido' });
    }
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }
    if (subject != null && (typeof subject !== 'string' || subject.length > MAX_SUBJECT_LENGTH)) {
      return res.status(400).json({ error: 'Asunto inválido' });
    }
    if (threadId != null && (typeof threadId !== 'string' || !UUID.test(threadId))) {
      return res.status(400).json({ error: 'Conversación inválida' });
    }

    let context: string;
    if (threadId) {
      const { data: thread, error: threadError } = await serviceClient
        .from('message_threads')
        .select('id, workspace_id')
        .eq('id', threadId)
        .maybeSingle();
      if (threadError) {
        console.error('[messaging/send] thread lookup failed');
        return res.status(500).json({ error: 'No se pudo verificar la conversación' });
      }
      if (!thread || !thread.workspace_id) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      for (const memberId of [user.id, recipientId]) {
        const { data: canAccess, error: accessError } = await serviceClient.rpc('can_access_workspace', {
          p_user_id: memberId,
          p_workspace_id: thread.workspace_id,
        });
        if (accessError) {
          console.error('[messaging/send] membership check failed');
          return res.status(500).json({ error: 'No se pudo verificar la membresía' });
        }
        if (canAccess !== true) {
          return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario en esta conversación' });
        }
      }
      context = 'workspace_thread';
    } else {
      const { data: roles, error: rolesError } = await serviceClient
        .from('user_roles')
        .select('user_id, school_id, community_id')
        .in('user_id', [user.id, recipientId])
        .eq('is_active', true);
      if (rolesError) {
        console.error('[messaging/send] membership check failed');
        return res.status(500).json({ error: 'No se pudo verificar la membresía' });
      }
      const scopeOf = (userId: string) => {
        const scope = new Set<string>();
        for (const role of (roles ?? []) as ScopeRole[]) {
          if (role.user_id !== userId) continue;
          if (role.community_id) scope.add(`community:${role.community_id}`);
          if (role.school_id != null) scope.add(`school:${role.school_id}`);
        }
        return scope;
      };
      const senderScope = scopeOf(user.id);
      const sharesScope = Array.from(scopeOf(recipientId)).some((key) => senderScope.has(key));
      if (!sharesScope) {
        return res.status(403).json({ error: 'No puedes enviar mensajes a este usuario' });
      }
      context = 'direct_message';
    }

    const { data: message, error: messageError } = await serviceClient
      .from('workspace_messages')
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        content,
        subject: subject || 'Mensaje directo',
        thread_id: threadId || null,
        context,
        sent_at: new Date().toISOString(),
        notification_sent: false,
      })
      .select('id, recipient_id')
      .single();
    if (messageError || !message) {
      console.error('[messaging/send] message insert failed');
      return res.status(500).json({ error: 'No se pudo enviar el mensaje' });
    }

    let notificationSent = false;
    try {
      const { data: senderProfile } = await serviceClient
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();
      const senderName =
        `${senderProfile?.first_name ?? ''} ${senderProfile?.last_name ?? ''}`.trim() || 'Un usuario';

      const result = await NotificationService.triggerNotification('message_sent', {
        message_id: message.id,
        sender_id: user.id,
        recipient_id: message.recipient_id,
        sender_name: senderName,
        content: 'Tienes un nuevo mensaje',
        context,
      });
      if (result.success && (result.notificationsCreated ?? 0) > 0) {
        const { error: markError } = await serviceClient
          .from('workspace_messages')
          .update({ notification_sent: true })
          .eq('id', message.id);
        notificationSent = !markError;
        if (markError) {
          console.error('[messaging/send] notification_sent update failed');
        }
      } else {
        console.error('[messaging/send] message notification was not created');
      }
    } catch {
      // Nonfatal: the message is saved. The exception text is not logged.
      console.error('[messaging/send] message notification failed');
    }

    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado',
      messageId: message.id,
      notificationSent,
    });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[messaging/send] unexpected error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
