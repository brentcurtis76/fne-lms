import { NextApiRequest, NextApiResponse } from 'next';
import NotificationService from '../../../lib/notificationService';
import {
  getApiUser,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
} from '../../../lib/api-auth';

/**
 * /api/messaging/mention — notifies a user mentioned in a community post
 * (lib/services/feedService.ts, after the post and its post_mentions rows are saved).
 *
 * The caller supplies only the post id (`discussion_id`) and the mentioned user
 * id. The service-role write and the notification happen only when:
 *
 *   * the post exists and the caller is its author;
 *   * a persisted post_mentions row links that post to that user;
 *   * both the author and the mentioned user can access the post's workspace
 *     (can_access_workspace: active community member, school consultor or admin).
 *
 * The notification text is generic: the post body and any caller-supplied
 * preview, name or context never reach the notification, the e-mail or a log.
 * A repeated call for an already-recorded mention does not notify again.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXT = 'community_post';

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

    const { mentioned_user_id: mentionedUserId, discussion_id: postId, context } = req.body ?? {};
    if (
      typeof mentionedUserId !== 'string' || !UUID.test(mentionedUserId) ||
      typeof postId !== 'string' || !UUID.test(postId)
    ) {
      return res.status(400).json({ error: 'Identificadores de mención inválidos' });
    }
    if (context !== undefined && context !== CONTEXT) {
      return res.status(400).json({ error: 'Tipo de mención no soportado' });
    }

    const { data: post, error: postError } = await serviceClient
      .from('community_posts')
      .select('id, workspace_id, author_id, is_archived')
      .eq('id', postId)
      .maybeSingle();
    if (postError) {
      console.error('[messaging/mention] post lookup failed');
      return res.status(500).json({ error: 'No se pudo verificar la publicación' });
    }
    if (!post || post.is_archived) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    if (post.author_id !== user.id) {
      return res.status(403).json({ error: 'Solo el autor de la publicación puede notificar sus menciones' });
    }

    const { data: postMentions, error: postMentionError } = await serviceClient
      .from('post_mentions')
      .select('id')
      .eq('post_id', post.id)
      .eq('mentioned_user_id', mentionedUserId)
      .limit(1);
    if (postMentionError) {
      console.error('[messaging/mention] post mention lookup failed');
      return res.status(500).json({ error: 'No se pudo verificar la mención' });
    }
    if (!postMentions || postMentions.length === 0) {
      return res.status(404).json({ error: 'Mención no encontrada' });
    }

    for (const [memberId, deniedMessage] of [
      [user.id, 'No tienes acceso a esta comunidad'],
      [mentionedUserId, 'El usuario mencionado no pertenece a esta comunidad'],
    ]) {
      const { data: canAccess, error: accessError } = await serviceClient.rpc('can_access_workspace', {
        p_user_id: memberId,
        p_workspace_id: post.workspace_id,
      });
      if (accessError) {
        console.error('[messaging/mention] membership check failed');
        return res.status(500).json({ error: 'No se pudo verificar la membresía' });
      }
      if (canAccess !== true) {
        return res.status(403).json({ error: deniedMessage });
      }
    }

    const { data: existing, error: existingError } = await serviceClient
      .from('user_mentions')
      .select('id')
      .eq('author_id', user.id)
      .eq('mentioned_user_id', mentionedUserId)
      .eq('context', CONTEXT)
      .eq('discussion_id', post.id)
      .limit(1);
    if (existingError) {
      console.error('[messaging/mention] mention lookup failed');
      return res.status(500).json({ error: 'No se pudo registrar la mención' });
    }
    if (existing && existing.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'La mención ya estaba registrada',
        mentionId: existing[0].id,
        notificationSent: false,
      });
    }

    const { data: mention, error: mentionError } = await serviceClient
      .from('user_mentions')
      .insert({
        author_id: user.id,
        mentioned_user_id: mentionedUserId,
        context: CONTEXT,
        discussion_id: post.id,
      })
      .select('id')
      .single();
    if (mentionError || !mention) {
      console.error('[messaging/mention] mention insert failed');
      return res.status(500).json({ error: 'No se pudo registrar la mención' });
    }

    let notificationSent = false;
    try {
      const { data: authorProfile } = await serviceClient
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();
      const authorName =
        `${authorProfile?.first_name ?? ''} ${authorProfile?.last_name ?? ''}`.trim() || 'Un usuario';

      const result = await NotificationService.triggerNotification('user_mentioned', {
        mention_id: mention.id,
        author_id: user.id,
        mentioned_user_id: mentionedUserId,
        author_name: authorName,
        context: CONTEXT,
        discussion_id: post.id,
        workspace_id: post.workspace_id,
        content_preview: 'Te mencionaron en una publicación',
      });
      notificationSent = result.success && (result.notificationsCreated ?? 0) > 0;
      if (!notificationSent) {
        console.error('[messaging/mention] mention notification was not created');
      }
    } catch {
      // Nonfatal: the mention is saved. The exception text is not logged.
      console.error('[messaging/mention] mention notification failed');
    }

    return res.status(200).json({
      success: true,
      message: 'Mención registrada',
      mentionId: mention.id,
      notificationSent,
    });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[messaging/mention] unexpected error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
