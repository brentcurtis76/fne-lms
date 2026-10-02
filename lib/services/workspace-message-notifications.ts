/**
 * Mention and reply bells for a saved workspace message (NOTIF plan D8, ledger N2-03).
 *
 * Everything is derived from the persisted rows, read with the service role:
 *
 *   * the message exists, is not deleted and the caller wrote it;
 *   * its thread belongs to the message's workspace, and a reply's parent sits
 *     in the same thread (any other linkage notifies nobody);
 *   * a mentioned user is one already recorded in message_mentions, or a
 *     claimed user whose composer handle (`@First_Last`) is in the saved text;
 *   * every recipient, like the author, passes can_access_workspace.
 *
 * The reply author gets only the reply bell, even when also mentioned, and the
 * author is never notified. Each bell is keyed by message and recipient, so a
 * repeat for the same message id creates only the bells still missing. The copy
 * is generic: the message body never reaches a bell, an e-mail or a log.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import NotificationService from '../notificationService';

export const MENTION_COPY = 'Te mencionaron en un mensaje del espacio de trabajo';
export const REPLY_COPY = 'Respondieron a tu mensaje en el espacio de trabajo';

const HANDLE = /@([a-zA-Z0-9_]+)/g;
const LOG = '[workspace-message-notifications]';

export interface WorkspaceMessageInput {
  messageId: string;
  workspaceId: string;
  mentionedUserIds: string[];
}

export type WorkspaceMessageOutcome =
  | { status: 200; body: { success: true; notified: number } }
  | { status: 400 | 403 | 404 | 500; body: { error: string } };

type Recipient = { id: string; event: 'user_mentioned' | 'message_sent' };

const fail = (status: 400 | 403 | 404 | 500, error: string): WorkspaceMessageOutcome => ({ status, body: { error } });

/** The handle the messaging composer inserts for a member (MessageComposer + toMentionSuggestion). */
function mentionHandle(profile: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
  const display =
    profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile.email?.split('@')[0] || 'Usuario';
  return display.replace(/\s+/g, '_');
}

export async function notifyWorkspaceMessage(
  client: SupabaseClient,
  actorId: string,
  input: WorkspaceMessageInput
): Promise<WorkspaceMessageOutcome> {
  const { data: message, error: messageError } = await client
    .from('community_messages')
    .select('id, workspace_id, thread_id, reply_to_id, author_id, content, is_deleted')
    .eq('id', input.messageId)
    .maybeSingle();
  if (messageError) {
    console.error(`${LOG} message lookup failed`);
    return fail(500, 'No se pudo verificar el mensaje');
  }
  if (!message || message.is_deleted) return fail(404, 'Mensaje no encontrado');
  if (message.author_id !== actorId) return fail(403, 'Solo el autor del mensaje puede notificar');
  if (!message.workspace_id || message.workspace_id !== input.workspaceId || !message.thread_id) {
    return fail(400, 'El mensaje no pertenece a este espacio');
  }

  const { data: thread, error: threadError } = await client
    .from('message_threads')
    .select('id, workspace_id')
    .eq('id', message.thread_id)
    .maybeSingle();
  if (threadError) {
    console.error(`${LOG} thread lookup failed`);
    return fail(500, 'No se pudo verificar el hilo');
  }
  if (!thread || thread.workspace_id !== message.workspace_id) return fail(400, 'El hilo del mensaje no es válido');

  // null = the check itself failed: the caller fails closed.
  const canAccess = async (userId: string): Promise<boolean | null> => {
    const { data, error } = await client.rpc('can_access_workspace', {
      p_user_id: userId,
      p_workspace_id: message.workspace_id,
    });
    return error ? null : data === true;
  };

  const actorAccess = await canAccess(actorId);
  if (actorAccess === null) {
    console.error(`${LOG} membership check failed`);
    return fail(500, 'No se pudo verificar la membresía');
  }
  if (!actorAccess) return fail(403, 'No tienes acceso a este espacio');

  let replyRecipient: string | null = null;
  if (message.reply_to_id) {
    const { data: parent, error: parentError } = await client
      .from('community_messages')
      .select('author_id, thread_id, is_deleted')
      .eq('id', message.reply_to_id)
      .maybeSingle();
    if (parentError) {
      console.error(`${LOG} parent lookup failed`);
      return fail(500, 'No se pudo verificar la respuesta');
    }
    if (!parent || parent.thread_id !== message.thread_id) return fail(400, 'La respuesta no corresponde a este hilo');
    if (!parent.is_deleted && parent.author_id && parent.author_id !== actorId) replyRecipient = parent.author_id;
  }

  const { data: saved, error: savedError } = await client
    .from('message_mentions')
    .select('mentioned_user_id')
    .eq('message_id', message.id);
  if (savedError) {
    console.error(`${LOG} mention lookup failed`);
    return fail(500, 'No se pudo verificar las menciones');
  }
  const recorded = new Set((saved ?? []).map((row: { mentioned_user_id: string }) => row.mentioned_user_id));

  const claimed = [...new Set(input.mentionedUserIds.map((id) => id.toLowerCase()))].filter(
    (id) => id !== actorId && !recorded.has(id)
  );
  const newMentions: Array<{ id: string; handle: string }> = [];
  if (claimed.length > 0) {
    const { data: profiles, error: profileError } = await client
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', claimed);
    if (profileError) {
      console.error(`${LOG} mentioned profile lookup failed`);
      return fail(500, 'No se pudo verificar las menciones');
    }
    const handles = new Set([...String(message.content ?? '').matchAll(HANDLE)].map((match) => match[1]));
    for (const profile of profiles ?? []) {
      const handle = mentionHandle(profile);
      if (handles.has(handle)) newMentions.push({ id: profile.id, handle });
    }
  }

  const access = new Map<string, boolean>();
  for (const id of new Set([...recorded, ...newMentions.map((m) => m.id), ...(replyRecipient ? [replyRecipient] : [])])) {
    if (id === actorId) continue;
    const allowed = await canAccess(id);
    if (allowed === null) {
      console.error(`${LOG} recipient membership check failed`);
      return fail(500, 'No se pudo verificar la membresía');
    }
    access.set(id, allowed);
  }

  const toRecord = newMentions.filter((m) => access.get(m.id));
  if (toRecord.length > 0) {
    const { error: insertError } = await client
      .from('message_mentions')
      .insert(toRecord.map((m) => ({ message_id: message.id, mentioned_user_id: m.id, mention_text: `@${m.handle}` })));
    if (insertError) {
      console.error(`${LOG} mention insert failed`);
      return fail(500, 'No se pudo registrar las menciones');
    }
  }

  const recipients: Recipient[] = [];
  if (replyRecipient && access.get(replyRecipient)) recipients.push({ id: replyRecipient, event: 'message_sent' });
  for (const id of new Set([...recorded, ...toRecord.map((m) => m.id)])) {
    if (id !== actorId && id !== replyRecipient && access.get(id)) recipients.push({ id, event: 'user_mentioned' });
  }

  const { data: author } = await client.from('profiles').select('first_name, last_name').eq('id', actorId).maybeSingle();
  const authorName = `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim() || 'Un usuario';
  const context = { message_id: message.id, thread_id: message.thread_id, workspace_id: message.workspace_id };

  let failed = 0;
  for (const recipient of recipients) {
    const eventData =
      recipient.event === 'user_mentioned'
        ? { ...context, mentioned_user_id: recipient.id, author_name: authorName, content_preview: MENTION_COPY }
        : { ...context, recipient_id: recipient.id, sender_name: authorName, content: REPLY_COPY };
    try {
      const result = await NotificationService.triggerNotification(recipient.event, eventData);
      if (!result.success || !((result.notificationsCreated ?? 0) > 0)) failed++;
    } catch {
      failed++;
    }
  }
  if (failed > 0) {
    // Nonfatal for the message, which stays saved: a repeat for its id fills the gap.
    console.error(`${LOG} notifications not created`, { failed });
    return fail(500, 'No se pudieron crear todas las notificaciones');
  }

  return { status: 200, body: { success: true, notified: recipients.length } };
}
