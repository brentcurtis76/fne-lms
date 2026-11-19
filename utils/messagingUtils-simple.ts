/**
 * Simplified Messaging System Utilities
 * Phase 4 of Collaborative Workspace System for Genera
 * Minimal version to get messaging working without complex functions
 */

import { supabase } from '../lib/supabase-wrapper';
import { fetchProfileCards, cardName } from '../lib/profile-cards';
import {
  ThreadWithDetails,
  MessageWithDetails,
  MessageFilters,
  ThreadFilters,
  MessagingPermissions,
  ThreadCreationData,
  MessageCompositionData,
  ThreadCategory,
  ThreadCategoryConfig,
  MessageType,
  THREAD_CATEGORIES,
} from '../types/messaging';

/**
 * How a thread's category is shown. A custom category is shown by its stored
 * name, with the look of the default category (no new colour or icon); it was
 * stored but shown as «General» (send-back 1, 7).
 */
function categoryConfigFor(thread: { category?: string | null; custom_category_name?: string | null }): ThreadCategoryConfig {
  const customName = thread.custom_category_name?.trim();
  if (customName) {
    return { ...THREAD_CATEGORIES[0], type: 'custom', label: customName, description: customName };
  }
  return THREAD_CATEGORIES.find(cat => cat.type === thread.category) || THREAD_CATEGORIES[0];
}

// =============================================================================
// SIMPLIFIED THREAD FUNCTIONS
// =============================================================================

/**
 * The order of the thread list for the filter in use: the column and the
 * direction. The fetch hands it to the database; the page re-applies it after
 * it changes a thread's stored counters in its own state (F18f send-back 1).
 */
export function threadSortRule(filters: ThreadFilters = {}) {
  return {
    column: filters.sort_by || 'last_message_at',
    ascending: (filters.sort_order || 'desc') === 'asc',
  } as const;
}

/**
 * The list sorted by threadSortRule as the database sorts it: empty values
 * last when ascending and first when descending (PostgreSQL's default);
 * threads that tie keep their place.
 */
export function sortThreads<T extends Partial<Pick<ThreadWithDetails, 'last_message_at' | 'created_at' | 'message_count' | 'participant_count' | 'thread_title'>>>(
  threads: T[],
  filters: ThreadFilters = {}
): T[] {
  const { column, ascending } = threadSortRule(filters);
  const valueOf = (thread: T): number | string | null => {
    const raw = thread[column as keyof T] as unknown;
    if (raw === null || raw === undefined) return null;
    if (column === 'last_message_at' || column === 'created_at') {
      const time = Date.parse(String(raw));
      return Number.isNaN(time) ? null : time;
    }
    return typeof raw === 'number' ? raw : String(raw);
  };
  return threads
    .map((thread, place) => ({ thread, place, value: valueOf(thread) }))
    .sort((a, b) => {
      if (a.value === b.value) return a.place - b.place;
      if (a.value === null) return ascending ? 1 : -1;
      if (b.value === null) return ascending ? -1 : 1;
      const order = typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value
        : String(a.value).localeCompare(String(b.value), 'es');
      if (order === 0) return a.place - b.place;
      return ascending ? order : -order;
    })
    .map(entry => entry.thread);
}

/**
 * Get threads for a workspace (simplified)
 */
export async function getWorkspaceThreads(
  workspaceId: string,
  filters: ThreadFilters = {}
): Promise<ThreadWithDetails[]> {
  try {
    // First get the threads - be explicit about columns to avoid schema cache issues
    let query = supabase
      .from('message_threads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false);

    // Apply filters
    if (filters.search) {
      query = query.ilike('thread_title', `%${filters.search}%`);
    }
    
    if (filters.category) {
      query = query.eq('custom_category_name', filters.category);
    }
    
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'pinned') {
        query = query.eq('is_pinned', true);
      } else if (filters.status === 'active') {
        query = query.eq('is_locked', false);
      }
    }

    // Apply sorting
    const sortRule = threadSortRule(filters);
    query = query.order(sortRule.column, { ascending: sortRule.ascending });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching threads:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      // Gracefully handle missing tables
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Message threads table not found - feature not yet implemented');
      } else {
        console.error('Error fetching threads:', error);
      }
      return [];
    }

    // Creators' names through the profile cards (EC-S5): other people's
    // profile rows are not readable by members.
    const creators = await fetchProfileCards(supabase, (data || []).map(thread => thread.created_by));

    // Transform to ThreadWithDetails format
    return (data || []).map(thread => {
      const creatorName = cardName(creators.get(thread.created_by));
      
      const categoryConfig = categoryConfigFor(thread);

      return {
        ...thread,
        creator_name: creatorName,
        creator_email: '',
        latest_message: null, // Will be populated separately if needed
        participants: [],
        unread_count: 0,
        category_config: categoryConfig
      };
    });

  } catch (error) {
    console.error('Error in getWorkspaceThreads:', error);
    return [];
  }
}

/**
 * The community owning a thread, or null when the thread or its workspace is
 * not visible to the caller. Reads ids only, never thread content; callers
 * must still check the community against the caller's own access.
 */
export async function getThreadCommunityId(threadId: string): Promise<string | null> {
  try {
    const { data: thread, error } = await supabase
      .from('message_threads')
      .select('workspace_id')
      .eq('id', threadId)
      .maybeSingle();
    if (error || !thread?.workspace_id) return null;

    const { data: workspace, error: workspaceError } = await supabase
      .from('community_workspaces')
      .select('community_id')
      .eq('id', thread.workspace_id)
      .maybeSingle();
    if (workspaceError || !workspace?.community_id) return null;

    return workspace.community_id;
  } catch {
    console.error('Thread community lookup failed');
    return null;
  }
}

/**
 * Get messages for a workspace or thread (simplified)
 */
export async function getWorkspaceMessages(
  workspaceId: string,
  filters: MessageFilters = {}
): Promise<MessageWithDetails[]> {
  try {
    // First get the messages
    let query = supabase
      .from('community_messages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false);

    // Apply filters
    if (filters.thread_id) {
      query = query.eq('thread_id', filters.thread_id);
    }
    
    if (filters.search) {
      query = query.ilike('content', `%${filters.search}%`);
    }
    
    if (filters.author_id) {
      query = query.eq('author_id', filters.author_id);
    }
    
    if (filters.message_type) {
      query = query.eq('message_type', filters.message_type);
    }

    // Apply sorting. Every option the page offers maps to an existing column:
    // «Relevancia» and «Actividad del hilo» have no column of their own and
    // keep the default order (EC-M10); ordering by a missing column emptied
    // the conversation.
    const MESSAGE_SORT_COLUMNS: Record<NonNullable<MessageFilters['sort_by']>, string> = {
      created_at: 'created_at',
      relevance: 'created_at',
      thread_activity: 'created_at',
    };
    const sortBy = MESSAGE_SORT_COLUMNS[filters.sort_by || 'created_at'] || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
    }

    const { data, error } = await query;

    if (error) {
      // Gracefully handle missing tables
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Community messages table not found - feature not yet implemented');
      } else {
        console.error('Error fetching messages:', error);
      }
      return [];
    }

    return await withMessageDetails(data || []);

  } catch (error) {
    console.error('Error in getWorkspaceMessages:', error);
    return [];
  }
}

/**
 * The active attachment records of messages, with the query and client the
 * conversation's loading uses (so the same read rules apply). Null when the
 * read fails.
 */
async function readMessageAttachments(messageIds: string[]): Promise<any[] | null> {
  const { data: attachments, error } = await supabase
    .from('message_attachments')
    .select('*')
    .in('message_id', messageIds)
    .eq('is_active', true);
  return error ? null : attachments ?? [];
}

/** Attachments, reactions, replied messages and names for message rows. */
async function withMessageDetails(data: any[]): Promise<MessageWithDetails[]> {
  // Get attachments for all messages
  const messageIds = (data || []).map(msg => msg.id);
  let attachmentsByMessage: Record<string, any[]> = {};

  if (messageIds.length > 0) {
    const attachments = await readMessageAttachments(messageIds);

    if (attachments) {
      attachmentsByMessage = attachments.reduce((acc, att) => {
        if (!acc[att.message_id]) {
          acc[att.message_id] = [];
        }
        acc[att.message_id].push(att);
        return acc;
      }, {} as Record<string, any[]>);
    }
  }

  // Get current user for reaction tracking
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const currentUserId = currentUser?.id;

  // Get reactions for all messages. message_reactions.user_id references
  // auth.users, not profiles, so a `profiles:user_id` embed fails (PGRST200)
  // and every reaction vanished on reload (EC-M3); the names of the people
  // who reacted come from the profile cards below.
  let reactionsByMessage: Record<string, any[]> = {};

  if (messageIds.length > 0) {
    const { data: reactions, error: reactionsError } = await supabase
      .from('message_reactions')
      .select('id, message_id, user_id, reaction_type, created_at')
      .in('message_id', messageIds);

    if (reactionsError) {
      console.warn('[getWorkspaceMessages] Error fetching reactions:', reactionsError);
    } else if (reactions) {
      // Group reactions by message_id and reaction_type
      reactions.forEach(reaction => {
        if (!reactionsByMessage[reaction.message_id]) {
          reactionsByMessage[reaction.message_id] = [];
        }

        // Find existing reaction type group or create new
        let reactionGroup = reactionsByMessage[reaction.message_id].find(
          (r: any) => r.reaction_type === reaction.reaction_type
        );

        if (!reactionGroup) {
          reactionGroup = {
            reaction_type: reaction.reaction_type,
            count: 0,
            user_reacted: false,
            users: []
          };
          reactionsByMessage[reaction.message_id].push(reactionGroup);
        }

        // Add to count and users list (names are filled in from the cards)
        reactionGroup.count++;
        reactionGroup.users.push({ user_id: reaction.user_id, user_name: 'Usuario' });

        // Check if current user reacted
        if (reaction.user_id === currentUserId) {
          reactionGroup.user_reacted = true;
        }
      });
    }
  }

  // Get reply_to messages if any messages have reply_to_id
  const replyToIds = (data || [])
    .map(msg => msg.reply_to_id)
    .filter(id => id != null);
  let replyToMessages: Record<string, any> = {};

  if (replyToIds.length > 0) {
    const { data: replyTos } = await supabase
      .from('community_messages')
      .select('id, content, author_id, created_at')
      .in('id', replyToIds);

    if (replyTos) {
      replyTos.forEach(reply => {
        replyToMessages[reply.id] = {
          id: reply.id,
          content: reply.content,
          author_id: reply.author_id,
          created_at: reply.created_at
        };
      });
    }
  }

  // Names of authors, replied authors and reactors through the profile cards (EC-S5),
  // in one call: other people's profile rows are not readable by members.
  const authors = await fetchProfileCards(supabase, [
    ...(data || []).map(message => message.author_id),
    ...Object.values(replyToMessages).map(reply => reply.author_id),
    ...Object.values(reactionsByMessage).flat().flatMap(group => group.users.map((u: any) => u.user_id)),
  ]);
  Object.values(reactionsByMessage).flat().forEach(group => {
    group.users.forEach((u: any) => { u.user_name = cardName(authors.get(u.user_id)); });
  });
  Object.values(replyToMessages).forEach(reply => {
    reply.author_name = cardName(authors.get(reply.author_id));
    delete reply.author_id;
  });

  // Transform to MessageWithDetails format
  return (data || []).map(message => {
    const author = authors.get(message.author_id);

    return {
      ...message,
      author_name: cardName(author),
      author_email: '',
      author_avatar: author?.avatar_url || null,
      reply_to_message: message.reply_to_id ? replyToMessages[message.reply_to_id] || null : null,
      reactions: reactionsByMessage[message.id] || [],
      attachments: attachmentsByMessage[message.id] || [],
      mentions: message.mentions || [],
      user_reaction: undefined,
      is_mentioned: false
    };
  });
}

/**
 * The thread row was stored but the conversation is not complete (its first
 * message, or the read-back, failed). `threadId` is the id of that row: pass it
 * back to createThread to store only the first message. Nothing is deleted.
 */
export class ThreadCreationIncompleteError extends Error {
  readonly threadId: string;
  readonly reason: unknown;

  constructor(threadId: string, reason: unknown) {
    super('No se pudo crear la conversación');
    this.name = 'ThreadCreationIncompleteError';
    this.threadId = threadId;
    this.reason = reason;
  }
}

/** Whether a thread with this id, created by this person in this workspace, exists. */
async function ownThreadExists(threadId: string, workspaceId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('message_threads')
    .select('id')
    .eq('id', threadId)
    .eq('workspace_id', workspaceId)
    .eq('created_by', userId)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * Create a new thread (simplified)
 *
 * `existingThreadId`: the id a previous, incomplete attempt returned (see
 * ThreadCreationIncompleteError). When that person's thread already exists in
 * this workspace it is not inserted again; only the first message is stored.
 */
export async function createThread(
  workspaceId: string,
  threadData: ThreadCreationData,
  userId: string,
  existingThreadId?: string
): Promise<ThreadWithDetails> {
  try {
    // First get the user's profile to get their name
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();
      
    const creatorName = userProfile?.first_name && userProfile?.last_name 
      ? `${userProfile.first_name} ${userProfile.last_name}`
      : userProfile?.email || 'Usuario';

    // Create the thread. The id is made here and the row is NOT asked back in
    // the same request: the read rule messaging_read_boundary looks the thread
    // up by id and cannot see the row being inserted, so INSERT … RETURNING is
    // refused for members (EC-S4). The row is read by its id right after.
    const threadId = existingThreadId || crypto.randomUUID();
    const customCategoryName =
      threadData.category === 'custom' ? threadData.custom_category_name?.trim() || null : null;
    const alreadyThere = existingThreadId ? await ownThreadExists(threadId, workspaceId, userId) : false;
    const { error: insertError } = alreadyThere ? { error: null } : await supabase
      .from('message_threads')
      .insert({
        id: threadId,
        workspace_id: workspaceId,
        thread_title: threadData.thread_title,
        description: threadData.description,
        category: threadData.category,
        custom_category_name: customCategoryName,
        created_by: userId,
        is_pinned: false,
        is_locked: false,
        is_archived: false,
        last_message_at: new Date().toISOString(),
        // Zero until the first message is stored: the database trigger counts it
        // (a conversation whose first message fails does not read «1 mensaje»).
        message_count: 0,
        participant_count: 0
      });

    // A retry whose read missed the thread: a duplicate key on the person's own
    // thread means it is already there.
    const threadError =
      insertError && existingThreadId && (insertError as { code?: string }).code === '23505' &&
      (await ownThreadExists(threadId, workspaceId, userId))
        ? null
        : insertError;

    if (threadError) {
      console.error('Thread creation error:', threadError);
      console.error('Error details:', {
        code: threadError.code,
        message: threadError.message,
        details: threadError.details,
        hint: threadError.hint
      });
      
      // Gracefully handle missing tables
      if (threadError?.code === '42P01' || threadError?.message?.includes('does not exist')) {
        console.warn('Message threads table not found - feature not yet implemented');
        throw new Error('Messaging feature not yet implemented');
      } else {
        throw threadError;
      }
    }

    const { data: thread, error: readError } = await supabase
      .from('message_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (readError || !thread) {
      console.error('Thread read-back error:', readError);
      throw new ThreadCreationIncompleteError(threadId, readError);
    }

    // Create initial message. If it cannot be stored the conversation is not
    // created: the caller keeps the text and retries with this thread's id.
    const { error: messageError } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: workspaceId,
        thread_id: thread.id,
        author_id: userId,
        content: threadData.initial_message,
        message_type: 'regular',
        is_edited: false,
        is_deleted: false
      });

    if (messageError) {
      console.error('Error creating initial message:', messageError);
      throw new ThreadCreationIncompleteError(threadId, messageError);
    }

    const categoryConfig = categoryConfigFor(thread);

    return {
      ...thread,
      creator_name: creatorName,
      creator_email: userProfile?.email || '',
      latest_message: null,
      participants: [],
      unread_count: 0,
      category_config: categoryConfig
    };

  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
}

/** An attachment that could not be attached to a stored message, and why (EC-M9). */
export interface FailedAttachment {
  /** Position of the file in the attachments given to sendMessage (names may repeat). */
  index: number;
  name: string;
  reason: string;
}

const failureReason = (error: unknown): string =>
  (error as { message?: string } | null)?.message || 'Error desconocido';

/**
 * Send a message (simplified)
 *
 * The message is stored first; its attachments follow (their paths carry the
 * message's id). An attachment that cannot be uploaded or recorded is named in
 * `failedAttachments` and does not make the send throw: the message row
 * exists, and a retry would store it twice (EC-M9).
 */
export async function sendMessage(
  workspaceId: string | null,
  messageData: MessageCompositionData,
  userId: string
): Promise<MessageWithDetails & { failedAttachments: FailedAttachment[] }> {
  try {
    // First get the user's profile to get their name
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, avatar_url')
      .eq('id', userId)
      .single();
      
    const authorName = userProfile?.first_name && userProfile?.last_name 
      ? `${userProfile.first_name} ${userProfile.last_name}`
      : userProfile?.email || 'Usuario';

    const { data: message, error } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: workspaceId,
        thread_id: messageData.thread_id,
        reply_to_id: messageData.reply_to_id,
        author_id: userId,
        content: messageData.content,
        content_html: messageData.content_html,
        message_type: messageData.message_type || 'regular',
        is_edited: false,
        is_deleted: false
      })
      .select()
      .single();

    if (error) {
      // Gracefully handle missing tables
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Community messages table not found - feature not yet implemented');
        throw new Error('Messaging feature not yet implemented');
      } else {
        throw error;
      }
    }

    // Handle attachments if provided
    let attachmentRecords: any[] = [];
    const failedAttachments: FailedAttachment[] = [];
    if (messageData.attachments && messageData.attachments.length > 0) {
      for (const [index, file] of messageData.attachments.entries()) {
        try {
          // Generate unique file name
          const fileExt = file.name.split('.').pop();
          const fileName = `${workspaceId || messageData.thread_id}/${message.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('message-attachments')
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false
            });

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            failedAttachments.push({ index, name: file.name, reason: failureReason(uploadError) });
            continue; // Skip this file but continue with others
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('message-attachments')
            .getPublicUrl(fileName);

          // Create attachment record
          const { data: attachmentRecord, error: attachmentError } = await supabase
            .from('message_attachments')
            .insert({
              message_id: message.id,
              file_name: file.name,
              file_size: file.size,
              mime_type: file.type,
              storage_path: publicUrl,
              uploaded_by: userId
            })
            .select()
            .single();

          if (!attachmentError && attachmentRecord) {
            attachmentRecords.push(attachmentRecord);
          } else {
            // The file stays in the store with nothing pointing to it (decided: not removed).
            console.error('Error recording attachment:', attachmentError);
            failedAttachments.push({
              index,
              name: file.name,
              reason: attachmentError ? failureReason(attachmentError) : 'No se guardó el registro del archivo',
            });
          }
        } catch (attachmentErr) {
          console.error('Error processing attachment:', attachmentErr);
          failedAttachments.push({ index, name: file.name, reason: failureReason(attachmentErr) });
        }
      }
    }

    // The thread's counters and last-message time are kept by the database
    // (trigger trg_refresh_thread_counters, EC-M4); the browser does not write them.

    // The server derives the mention and reply bells from the saved message
    if ((messageData.mentions && messageData.mentions.length > 0) || messageData.reply_to_id) {
      await requestMessageNotifications(workspaceId, message.id, messageData.mentions ?? []);
    }

    return {
      ...message,
      author_name: authorName,
      author_email: userProfile?.email || '',
      author_avatar: userProfile?.avatar_url || null,
      reply_to_message: null,
      reactions: [],
      attachments: attachmentRecords,
      mentions: [],
      user_reaction: undefined,
      is_mentioned: false,
      failedAttachments
    };

  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * Get user messaging permissions (simplified)
 */
export async function getUserMessagingPermissions(
  userId: string,
  workspaceId: string
): Promise<MessagingPermissions> {
  try {
    // Default role (temporarily disable role-based logic)
    const userRole = 'docente';

    // Return permissions based on role
    return {
      can_view_messages: true,
      can_send_messages: true,
      can_create_threads: true,
      can_edit_own_messages: true,
      can_delete_own_messages: true,
      can_moderate_messages: false, // Simplified for now
      can_pin_threads: false, // Simplified for now
      can_archive_threads: false, // Simplified for now
      can_upload_attachments: true,
      can_mention_all: false, // Simplified for now
      can_view_analytics: false, // Simplified for now
      can_manage_reactions: true,
    };

  } catch (error) {
    console.error('Error getting messaging permissions:', error);
    // Return safe defaults
    return {
      can_view_messages: true,
      can_send_messages: true,
      can_create_threads: true,
      can_edit_own_messages: true,
      can_delete_own_messages: false,
      can_moderate_messages: false,
      can_pin_threads: false,
      can_archive_threads: false,
      can_upload_attachments: true,
      can_mention_all: false,
      can_view_analytics: false,
      can_manage_reactions: true,
    };
  }
}

/**
 * Simple Realtime subscription setup
 */
export function subscribeToWorkspaceMessages(
  workspaceId: string | null,
  callbacks: {
    onMessage?: (message: MessageWithDetails) => void;
    onThread?: (thread: ThreadWithDetails) => void;
    onReaction?: (reaction: any) => void;
  },
  threadId?: string
) {
  if (!workspaceId && !threadId) return { unsubscribe: () => {} };
  const subscriptionScope = workspaceId || threadId;
  try {
    // Subscribe to new messages
    const messageSubscription = supabase
      .channel(`workspace-messages-${subscriptionScope}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: threadId ? `thread_id=eq.${threadId}` : `workspace_id=eq.${workspaceId}`
        },
        async (payload) => {
          if (callbacks.onMessage) {
            // Fetch author profile for the new message
            const authorId = payload.new.author_id;
            let authorName = 'Usuario';
            const authorEmail = '';
            let authorAvatar = null;

            if (authorId) {
              const card = (await fetchProfileCards(supabase, [authorId])).get(authorId);
              authorName = cardName(card);
              authorAvatar = card?.avatar_url || null;
            }

            // Transform payload to MessageWithDetails format
            const message = {
              ...payload.new,
              author_name: authorName,
              author_email: authorEmail,
              author_avatar: authorAvatar,
              reply_to_message: null,
              reactions: [],
              attachments: [],
              mentions: [],
              user_reaction: undefined,
              is_mentioned: false
            } as MessageWithDetails;
            callbacks.onMessage(message);
          }
        }
      )
      .subscribe();

    // Subscribe to new threads
    const threadSubscription = supabase
      .channel(`workspace-threads-${subscriptionScope}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: threadId ? `id=eq.${threadId}` : `workspace_id=eq.${workspaceId}`
        },
        async (payload) => {
          if (callbacks.onThread) {
            // Fetch creator profile for the new thread
            const creatorId = payload.new.created_by;
            let creatorName = 'Usuario';
            const creatorEmail = '';

            if (creatorId) {
              creatorName = cardName((await fetchProfileCards(supabase, [creatorId])).get(creatorId));
            }

            // Transform payload to ThreadWithDetails format
            const thread = {
              ...payload.new,
              creator_name: creatorName,
              creator_email: creatorEmail,
              latest_message: null,
              participants: [],
              unread_count: 0,
              category_config: categoryConfigFor(payload.new)
            } as ThreadWithDetails;
            callbacks.onThread(thread);
          }
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        messageSubscription.unsubscribe();
        threadSubscription.unsubscribe();
      }
    };

  } catch (error) {
    console.error('Error setting up realtime subscription:', error);
    return {
      unsubscribe: () => {}
    };
  }
}

/**
 * Asks /api/community/workspace-message-notifications for a saved message's
 * mention and reply bells. The message stays sent whatever happens here; a
 * repeat for the same message id creates only the bells still missing.
 */
async function requestMessageNotifications(
  workspaceId: string | null,
  messageId: string,
  mentions: string[]
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('Message notifications skipped: no auth session');
      return;
    }
    const response = await fetch('/api/community/workspace-message-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message_id: messageId, workspace_id: workspaceId, mentioned_user_ids: mentions }),
    });
    if (!response.ok) {
      console.error('Message notifications rejected with status', response.status);
    }
  } catch {
    console.error('Message notifications request failed');
  }
}
