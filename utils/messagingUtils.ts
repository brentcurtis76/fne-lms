/**
 * Messaging System Utilities
 * Phase 4 of Collaborative Workspace System for FNE LMS
 * Following established patterns from utils/documentUtils.ts
 */

// =============================================================================
// IMPORTS AND DEPENDENCIES
// =============================================================================

import { supabase } from '../lib/supabase';
import { getUserWorkspaceAccess } from './workspaceUtils';
import {
  MessageThread,
  ThreadWithDetails,
  CommunityMessage,
  MessageWithDetails,
  MessageReaction,
  MessageAttachment,
  MessageMention,
  ThreadCreationData,
  MessageCompositionData,
  MessageEditData,
  MessageFilters,
  ThreadFilters,
  MessagingStatistics,
  MessagingPermissions,
  MessageSearchResult,
  ThreadParticipant,
  MessageReactionSummary,
  AttachmentUploadProgress,
  MessageValidation,
  MessageActivityType,
  ReactionType,
  ThreadCategory,
  MessageType,
  REACTION_TYPES,
  THREAD_CATEGORIES,
  DEFAULT_MESSAGING_CONFIG,
} from '../types/messaging';

// =============================================================================
// THREAD MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Get threads for a workspace with filters and pagination
 */
export async function getWorkspaceThreads(
  workspaceId: string,
  filters: ThreadFilters = {}
): Promise<{ threads: ThreadWithDetails[]; total: number }> {
  try {
    let query = supabase
      .from('message_threads')
      .select(`
        *,
        creator:auth.users!created_by(
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq('workspace_id', workspaceId);

    // Apply filters
    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    if (filters.status) {
      switch (filters.status) {
        case 'pinned':
          query = query.eq('is_pinned', true);
          break;
        case 'archived':
          query = query.eq('is_archived', true);
          break;
        case 'active':
          query = query.eq('is_archived', false);
          break;
      }
    }

    if (filters.created_by) {
      query = query.eq('created_by', filters.created_by);
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    if (filters.search) {
      query = query.ilike('thread_title', `%${filters.search}%`);
    }

    // Apply sorting
    const sortBy = filters.sort_by || 'last_message_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data: threads, error, count } = await query;

    if (error) throw error;

    // Enhanced threads with additional data
    const enhancedThreads = await Promise.all(
      (threads || []).map(async (thread) => {
        // Get latest message
        const { data: latestMessage } = await supabase
          .from('community_messages')
          .select(`
            id,
            content,
            created_at,
            profiles!community_messages_author_id_fkey(full_name, email)
          `)
          .eq('thread_id', thread.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get participants
        const participants = await getThreadParticipants(thread.id);

        // Get category configuration
        const categoryConfig = THREAD_CATEGORIES.find(cat => cat.type === thread.category) || THREAD_CATEGORIES[0];

        return {
          ...thread,
          creator_name: thread.creator?.raw_user_meta_data?.full_name || thread.creator?.email || 'Usuario',
          creator_email: thread.creator?.email || '',
          latest_message: latestMessage ? {
            id: latestMessage.id,
            content: latestMessage.content,
            author_name: latestMessage.profiles?.full_name || 'Usuario',
            created_at: latestMessage.created_at,
            attachment_count: 0,
          } : undefined,
          participants: participants || [],
          category_config: categoryConfig,
        } as ThreadWithDetails;
      })
    );

    return {
      threads: enhancedThreads,
      total: count || 0,
    };
  } catch (error) {
    console.error('Error getting workspace threads:', error);
    throw error;
  }
}

/**
 * Create a new message thread
 */
export async function createThread(
  threadData: ThreadCreationData,
  userId: string
): Promise<ThreadWithDetails> {
  try {
    // Create thread
    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        workspace_id: threadData.workspace_id,
        thread_title: threadData.thread_title,
        description: threadData.description,
        category: threadData.category,
        created_by: userId,
      })
      .select()
      .single();

    if (threadError) throw threadError;

    // Create initial message if provided
    if (threadData.initial_message.trim()) {
      await createMessage({
        content: threadData.initial_message,
        thread_id: thread.id,
        message_type: 'regular',
      }, userId);
    }

    // Log activity
    await logMessageActivity(userId, threadData.workspace_id, 'thread_created', {
      thread_id: thread.id,
      thread_title: threadData.thread_title,
      category: threadData.category,
    });

    // Return enhanced thread
    const { threads } = await getWorkspaceThreads(threadData.workspace_id, {
      limit: 1,
      offset: 0,
    });

    return threads.find(t => t.id === thread.id) || thread as ThreadWithDetails;
  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
}

/**
 * Update thread properties
 */
export async function updateThread(
  threadId: string,
  updates: Partial<MessageThread>,
  userId: string
): Promise<ThreadWithDetails> {
  try {
    const { data: thread, error } = await supabase
      .from('message_threads')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await logMessageActivity(userId, thread.workspace_id, 'thread_created', {
      thread_id: threadId,
      updates: Object.keys(updates),
    });

    return thread as ThreadWithDetails;
  } catch (error) {
    console.error('Error updating thread:', error);
    throw error;
  }
}

/**
 * Get thread participants with analytics
 */
export async function getThreadParticipants(threadId: string): Promise<ThreadParticipant[]> {
  try {
    const { data, error } = await supabase.rpc('get_thread_participants', {
      thread_uuid: threadId,
    });

    if (error) throw error;

    // Get user details for participants
    const userIds = data?.map((p: any) => p.user_id) || [];
    if (userIds.length === 0) return [];

    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, raw_user_meta_data')
      .in('id', userIds);

    if (usersError) console.error('Error fetching user details:', usersError);

    return data.map((participant: any) => {
      const user = users?.find(u => u.id === participant.user_id);
      return {
        user_id: participant.user_id,
        user_name: user?.raw_user_meta_data?.full_name || user?.email || 'Usuario',
        user_email: user?.email || '',
        user_avatar: user?.raw_user_meta_data?.avatar_url,
        message_count: participant.message_count,
        last_message_at: participant.last_message_at,
        total_reactions_given: participant.total_reactions_given,
        total_mentions: participant.total_mentions,
      };
    });
  } catch (error) {
    console.error('Error getting thread participants:', error);
    return [];
  }
}

// =============================================================================
// MESSAGE MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Get messages for a thread with pagination and filters
 */
export async function getThreadMessages(
  threadId: string,
  filters: MessageFilters = {}
): Promise<{ messages: MessageWithDetails[]; total: number }> {
  try {
    let query = supabase
      .from('community_messages')
      .select(`
        *,
        author:auth.users!author_id(
          id,
          email,
          raw_user_meta_data
        ),
        reply_to:community_messages!reply_to_id(
          id,
          content,
          created_at,
          author:auth.users!author_id(
            id,
            email,
            raw_user_meta_data
          )
        )
      `)
      .eq('thread_id', threadId)
      .eq('is_deleted', false);

    // Apply filters
    if (filters.search) {
      query = query.ilike('content', `%${filters.search}%`);
    }

    if (filters.author_id) {
      query = query.eq('author_id', filters.author_id);
    }

    if (filters.message_type) {
      query = query.eq('message_type', filters.message_type);
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // Apply sorting
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'asc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data: messages, error, count } = await query;

    if (error) throw error;

    // Enhanced messages with reactions, attachments, and mentions
    const enhancedMessages = await Promise.all(
      (messages || []).map(async (message) => {
        // Get reactions summary
        const reactions = await getMessageReactionSummary(message.id);

        // Get attachments
        const { data: attachments } = await supabase
          .from('message_attachments')
          .select('*')
          .eq('message_id', message.id)
          .eq('is_active', true);

        // Get mentions
        const { data: mentions } = await supabase
          .from('message_mentions')
          .select('*')
          .eq('message_id', message.id);

        return {
          ...message,
          author_name: message.author?.raw_user_meta_data?.full_name || message.author?.email || 'Usuario',
          author_email: message.author?.email || '',
          author_avatar: message.author?.raw_user_meta_data?.avatar_url,
          reply_to_message: message.reply_to ? {
            id: message.reply_to.id,
            content: message.reply_to.content,
            author_name: message.reply_to.author?.raw_user_meta_data?.full_name || message.reply_to.author?.email || 'Usuario',
            created_at: message.reply_to.created_at,
          } : undefined,
          reactions: reactions,
          attachments: attachments || [],
          mentions: mentions || [],
          user_reaction: undefined, // Will be set by component based on current user
          is_mentioned: false, // Will be set by component based on current user
        } as MessageWithDetails;
      })
    );

    return {
      messages: enhancedMessages,
      total: count || 0,
    };
  } catch (error) {
    console.error('Error getting thread messages:', error);
    throw error;
  }
}

/**
 * Create a new message
 */
export async function createMessage(
  messageData: MessageCompositionData,
  userId: string
): Promise<MessageWithDetails> {
  try {
    // Validate message content
    const validation = validateMessage(messageData);
    if (!validation.is_valid) {
      throw new Error(validation.errors.join(', '));
    }

    // Extract mentions from content
    const mentions = extractMentionsFromContent(messageData.content);

    // Create message
    const { data: message, error: messageError } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: (await getThreadWorkspaceId(messageData.thread_id)),
        thread_id: messageData.thread_id,
        reply_to_id: messageData.reply_to_id,
        author_id: userId,
        content: messageData.content,
        content_html: messageData.content_html,
        message_type: messageData.message_type || 'regular',
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Create mentions
    if (mentions.length > 0) {
      await createMessageMentions(message.id, mentions, userId);
    }

    // Handle attachments if provided
    if (messageData.attachments && messageData.attachments.length > 0) {
      await uploadMessageAttachments(message.id, messageData.attachments, userId);
    }

    // Log activity
    await logMessageActivity(userId, message.workspace_id, 'message_sent', {
      message_id: message.id,
      thread_id: messageData.thread_id,
      content_length: messageData.content.length,
      attachment_count: messageData.attachments?.length || 0,
      mention_count: mentions.length,
    });

    // Return enhanced message
    const { messages } = await getThreadMessages(messageData.thread_id, {
      limit: 1,
      offset: 0,
    });

    return messages.find(m => m.id === message.id) || message as MessageWithDetails;
  } catch (error) {
    console.error('Error creating message:', error);
    throw error;
  }
}

/**
 * Edit an existing message
 */
export async function editMessage(
  messageId: string,
  editData: MessageEditData,
  userId: string
): Promise<MessageWithDetails> {
  try {
    // Extract new mentions
    const mentions = extractMentionsFromContent(editData.content);

    // Update message
    const { data: message, error } = await supabase
      .from('community_messages')
      .update({
        content: editData.content,
        content_html: editData.content_html,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;

    // Update mentions
    await updateMessageMentions(messageId, mentions, userId);

    // Log activity
    await logMessageActivity(userId, message.workspace_id, 'message_edited', {
      message_id: messageId,
      thread_id: message.thread_id,
    });

    // Return enhanced message
    const { messages } = await getThreadMessages(message.thread_id, {
      limit: 1,
      offset: 0,
    });

    return messages.find(m => m.id === messageId) || message as MessageWithDetails;
  } catch (error) {
    console.error('Error editing message:', error);
    throw error;
  }
}

/**
 * Soft delete a message
 */
export async function deleteMessage(messageId: string, userId: string): Promise<void> {
  try {
    const { data: message, error } = await supabase
      .from('community_messages')
      .update({ is_deleted: true })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await logMessageActivity(userId, message.workspace_id, 'message_deleted', {
      message_id: messageId,
      thread_id: message.thread_id,
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
}

// =============================================================================
// REACTION MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Add or remove a reaction to a message
 */
export async function toggleMessageReaction(
  messageId: string,
  reactionType: ReactionType,
  userId: string
): Promise<{ added: boolean; reaction?: MessageReaction }> {
  try {
    // Check if reaction already exists
    const { data: existingReaction } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)
      .single();

    if (existingReaction) {
      // Remove reaction
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existingReaction.id);

      if (error) throw error;

      return { added: false };
    } else {
      // Add reaction
      const { data: reaction, error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: userId,
          reaction_type: reactionType,
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      const message = await getMessageById(messageId);
      if (message) {
        await logMessageActivity(userId, message.workspace_id, 'reaction_added', {
          message_id: messageId,
          thread_id: message.thread_id,
          reaction_type: reactionType,
        });
      }

      return { added: true, reaction };
    }
  } catch (error) {
    console.error('Error toggling message reaction:', error);
    throw error;
  }
}

/**
 * Get reaction summary for a message
 */
export async function getMessageReactionSummary(messageId: string): Promise<MessageReactionSummary[]> {
  try {
    const { data: reactions, error } = await supabase
      .from('message_reactions')
      .select(`
        reaction_type,
        user_id,
        users:auth.users!user_id(
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq('message_id', messageId);

    if (error) throw error;

    // Group reactions by type
    const reactionGroups = (reactions || []).reduce((groups, reaction) => {
      if (!groups[reaction.reaction_type]) {
        groups[reaction.reaction_type] = [];
      }
      groups[reaction.reaction_type].push({
        user_id: reaction.user_id,
        user_name: reaction.users?.raw_user_meta_data?.full_name || reaction.users?.email || 'Usuario',
      });
      return groups;
    }, {} as Record<ReactionType, Array<{ user_id: string; user_name: string }>>);

    // Convert to summary format
    return Object.entries(reactionGroups).map(([type, users]) => ({
      reaction_type: type as ReactionType,
      count: users.length,
      users: users,
      user_reacted: false, // Will be set by component based on current user
    }));
  } catch (error) {
    console.error('Error getting reaction summary:', error);
    return [];
  }
}

// =============================================================================
// ATTACHMENT MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Upload message attachments
 */
export async function uploadMessageAttachments(
  messageId: string,
  files: File[],
  userId: string
): Promise<MessageAttachment[]> {
  try {
    const attachments: MessageAttachment[] = [];

    for (const file of files) {
      // Validate file
      if (!isValidAttachment(file)) {
        throw new Error(`Archivo no válido: ${file.name}`);
      }

      // Generate storage path
      const timestamp = Date.now();
      const sanitizedFileName = sanitizeFileName(file.name);
      const storagePath = `message-attachments/${messageId}/${timestamp}-${sanitizedFileName}`;

      // Upload to Supabase Storage
      const { data: uploadResult, error: uploadError } = await supabase.storage
        .from('community-messages')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('community-messages')
        .getPublicUrl(storagePath);

      // Create attachment record
      const { data: attachment, error: attachmentError } = await supabase
        .from('message_attachments')
        .insert({
          message_id: messageId,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          storage_path: urlData.publicUrl,
          uploaded_by: userId,
        })
        .select()
        .single();

      if (attachmentError) throw attachmentError;

      attachments.push(attachment);

      // Log activity
      const message = await getMessageById(messageId);
      if (message) {
        await logMessageActivity(userId, message.workspace_id, 'attachment_uploaded', {
          message_id: messageId,
          thread_id: message.thread_id,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        });
      }
    }

    return attachments;
  } catch (error) {
    console.error('Error uploading message attachments:', error);
    throw error;
  }
}

// =============================================================================
// MENTION MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Create mentions for a message
 */
export async function createMessageMentions(
  messageId: string,
  mentions: string[],
  userId: string
): Promise<MessageMention[]> {
  try {
    // Resolve mentions to user IDs
    const mentionRecords = await resolveMentions(mentions);

    if (mentionRecords.length === 0) return [];

    // Create mention records
    const { data: createdMentions, error } = await supabase
      .from('message_mentions')
      .insert(
        mentionRecords.map(mention => ({
          message_id: messageId,
          mentioned_user_id: mention.user_id,
          mention_type: mention.mention_type,
          mention_text: mention.mention_text,
        }))
      )
      .select();

    if (error) throw error;

    // Log activity
    const message = await getMessageById(messageId);
    if (message) {
      await logMessageActivity(userId, message.workspace_id, 'mention_created', {
        message_id: messageId,
        thread_id: message.thread_id,
        mention_count: mentionRecords.length,
      });
    }

    return createdMentions || [];
  } catch (error) {
    console.error('Error creating message mentions:', error);
    throw error;
  }
}

/**
 * Update mentions for an edited message
 */
export async function updateMessageMentions(
  messageId: string,
  newMentions: string[],
  userId: string
): Promise<void> {
  try {
    // Delete existing mentions
    await supabase
      .from('message_mentions')
      .delete()
      .eq('message_id', messageId);

    // Create new mentions
    if (newMentions.length > 0) {
      await createMessageMentions(messageId, newMentions, userId);
    }
  } catch (error) {
    console.error('Error updating message mentions:', error);
    throw error;
  }
}

/**
 * Get unread mentions for a user
 */
export async function getUserUnreadMentions(
  userId: string,
  workspaceId?: string
): Promise<{ count: number; mentions: MessageMention[] }> {
  try {
    const { data: count } = await supabase.rpc('get_unread_mention_count', {
      user_uuid: userId,
      workspace_uuid: workspaceId,
    });

    let query = supabase
      .from('message_mentions')
      .select(`
        *,
        message:community_messages!message_id(
          id,
          content,
          created_at,
          thread_id,
          author:auth.users!author_id(
            id,
            email,
            raw_user_meta_data
          ),
          thread:message_threads!thread_id(
            id,
            thread_title,
            workspace_id
          )
        )
      `)
      .eq('mentioned_user_id', userId)
      .eq('is_read', false);

    if (workspaceId) {
      query = query.eq('message.thread.workspace_id', workspaceId);
    }

    const { data: mentions, error } = await query
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return {
      count: count || 0,
      mentions: mentions || [],
    };
  } catch (error) {
    console.error('Error getting unread mentions:', error);
    return { count: 0, mentions: [] };
  }
}

/**
 * Mark mentions as read
 */
export async function markMentionsAsRead(userId: string, messageIds?: string[]): Promise<number> {
  try {
    const { data: updatedCount } = await supabase.rpc('mark_mentions_as_read', {
      user_uuid: userId,
      message_ids: messageIds,
    });

    return updatedCount || 0;
  } catch (error) {
    console.error('Error marking mentions as read:', error);
    return 0;
  }
}

// =============================================================================
// SEARCH AND ANALYTICS FUNCTIONS
// =============================================================================

/**
 * Search messages across threads
 */
export async function searchMessages(
  workspaceId: string,
  searchQuery: string,
  filters: MessageFilters = {}
): Promise<MessageSearchResult[]> {
  try {
    const { data: results, error } = await supabase.rpc('search_messages', {
      workspace_uuid: workspaceId,
      search_query: searchQuery,
      thread_uuid: filters.thread_id,
      limit_count: filters.limit || 50,
      offset_count: filters.offset || 0,
    });

    if (error) throw error;

    // Enhanced search results with thread info
    const enhancedResults = await Promise.all(
      (results || []).map(async (result: any) => {
        const { messages: [message] } = await getThreadMessages(result.thread_id, {
          limit: 1,
          offset: 0,
        });

        const { threads: [thread] } = await getWorkspaceThreads(workspaceId, {
          limit: 1,
          offset: 0,
        });

        return {
          message: message,
          thread: thread,
          highlighted_content: highlightSearchTerms(result.content, searchQuery),
          relevance_score: result.rank,
          match_type: 'content' as const,
        };
      })
    );

    return enhancedResults;
  } catch (error) {
    console.error('Error searching messages:', error);
    return [];
  }
}

/**
 * Get messaging statistics for a workspace
 */
export async function getMessagingStatistics(workspaceId: string): Promise<MessagingStatistics> {
  try {
    const { data: stats, error } = await supabase.rpc('get_messaging_statistics', {
      workspace_uuid: workspaceId,
    });

    if (error) throw error;

    return stats || {
      total_threads: 0,
      total_messages: 0,
      active_participants: 0,
      recent_activity: 0,
      pinned_threads: 0,
      total_attachments: 0,
      thread_categories: {},
    };
  } catch (error) {
    console.error('Error getting messaging statistics:', error);
    return {
      total_threads: 0,
      total_messages: 0,
      active_participants: 0,
      recent_activity: 0,
      pinned_threads: 0,
      total_attachments: 0,
      thread_categories: {},
    };
  }
}

// =============================================================================
// PERMISSION AND ACCESS CONTROL FUNCTIONS
// =============================================================================

/**
 * Get user messaging permissions for a workspace
 */
export async function getUserMessagingPermissions(
  userId: string,
  workspaceId: string
): Promise<MessagingPermissions> {
  try {
    const { accessType } = await getUserWorkspaceAccess(userId);

    switch (accessType) {
      case 'admin':
        return {
          can_view_messages: true,
          can_send_messages: true,
          can_create_threads: true,
          can_edit_own_messages: true,
          can_delete_own_messages: true,
          can_moderate_messages: true,
          can_pin_threads: true,
          can_archive_threads: true,
          can_upload_attachments: true,
          can_mention_all: true,
          can_view_analytics: true,
          can_manage_reactions: true,
        };

      case 'community_member':
        return {
          can_view_messages: true,
          can_send_messages: true,
          can_create_threads: true,
          can_edit_own_messages: true,
          can_delete_own_messages: true,
          can_moderate_messages: true,
          can_pin_threads: true,
          can_archive_threads: false,
          can_upload_attachments: true,
          can_mention_all: false,
          can_view_analytics: true,
          can_manage_reactions: false,
        };

      case 'consultant':
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
          can_manage_reactions: false,
        };

      default:
        return {
          can_view_messages: false,
          can_send_messages: false,
          can_create_threads: false,
          can_edit_own_messages: false,
          can_delete_own_messages: false,
          can_moderate_messages: false,
          can_pin_threads: false,
          can_archive_threads: false,
          can_upload_attachments: false,
          can_mention_all: false,
          can_view_analytics: false,
          can_manage_reactions: false,
        };
    }
  } catch (error) {
    console.error('Error getting messaging permissions:', error);
    throw error;
  }
}

// =============================================================================
// UTILITY HELPER FUNCTIONS
// =============================================================================

/**
 * Extract @mentions from message content
 */
export function extractMentionsFromContent(content: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
  const matches = content.match(mentionRegex);
  return matches ? matches.map(match => match.slice(1)) : [];
}

/**
 * Validate message content and attachments
 */
export function validateMessage(messageData: MessageCompositionData): MessageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Content validation
  if (!messageData.content || !messageData.content.trim()) {
    errors.push('El mensaje no puede estar vacío');
  }

  if (messageData.content && messageData.content.length > DEFAULT_MESSAGING_CONFIG.max_message_length) {
    errors.push(`El mensaje no puede exceder ${DEFAULT_MESSAGING_CONFIG.max_message_length} caracteres`);
  }

  // Attachment validation
  const attachmentCount = messageData.attachments?.length || 0;
  if (attachmentCount > DEFAULT_MESSAGING_CONFIG.max_attachments_per_message) {
    errors.push(`No se pueden adjuntar más de ${DEFAULT_MESSAGING_CONFIG.max_attachments_per_message} archivos`);
  }

  // Validate individual attachments
  if (messageData.attachments) {
    for (const file of messageData.attachments) {
      if (!isValidAttachment(file)) {
        errors.push(`Archivo no válido: ${file.name}`);
      }
    }
  }

  // Mention validation
  const mentions = extractMentionsFromContent(messageData.content);
  if (mentions.length > 20) {
    warnings.push('Demasiadas menciones en el mensaje');
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    content_length: messageData.content?.length || 0,
    mention_count: mentions.length,
    attachment_count: attachmentCount,
  };
}

/**
 * Check if file is valid attachment
 */
export function isValidAttachment(file: File): boolean {
  // Check file size
  if (file.size > DEFAULT_MESSAGING_CONFIG.max_attachment_size) {
    return false;
  }

  // Check file type
  if (!DEFAULT_MESSAGING_CONFIG.allowed_attachment_types.includes(file.type)) {
    return false;
  }

  return true;
}

/**
 * Sanitize file name for storage
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(date: string): string {
  const messageDate = new Date(date);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - messageDate.getTime()) / 1000);

  if (diffInSeconds < 60) return 'hace un momento';
  if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)}m`;
  if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `hace ${Math.floor(diffInSeconds / 86400)}d`;

  return messageDate.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Highlight search terms in content
 */
export function highlightSearchTerms(content: string, searchQuery: string): string {
  if (!searchQuery.trim()) return content;

  const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return content.replace(regex, '<mark>$1</mark>');
}

/**
 * Get reaction emoji by type
 */
export function getReactionEmoji(reactionType: ReactionType): string {
  const reaction = REACTION_TYPES.find(r => r.type === reactionType);
  return reaction?.emoji || '👍';
}

/**
 * Get reaction label by type
 */
export function getReactionLabel(reactionType: ReactionType): string {
  const reaction = REACTION_TYPES.find(r => r.type === reactionType);
  return reaction?.label || 'Reacción';
}

/**
 * Get thread category configuration
 */
export function getThreadCategoryConfig(category: ThreadCategory): ThreadCategoryConfig {
  return THREAD_CATEGORIES.find(c => c.type === category) || THREAD_CATEGORIES[0];
}

// =============================================================================
// PRIVATE HELPER FUNCTIONS
// =============================================================================

/**
 * Get message by ID (internal helper)
 */
async function getMessageById(messageId: string): Promise<CommunityMessage | null> {
  try {
    const { data, error } = await supabase
      .from('community_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting message by ID:', error);
    return null;
  }
}

/**
 * Get workspace ID for a thread (internal helper)
 */
async function getThreadWorkspaceId(threadId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('message_threads')
      .select('workspace_id')
      .eq('id', threadId)
      .single();

    if (error) throw error;
    return data.workspace_id;
  } catch (error) {
    console.error('Error getting thread workspace ID:', error);
    throw error;
  }
}

/**
 * Resolve mention strings to user records (internal helper)
 */
async function resolveMentions(mentions: string[]): Promise<Array<{
  user_id: string;
  mention_type: string;
  mention_text: string;
}>> {
  try {
    // For now, resolve by email (could be enhanced to support usernames)
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', mentions);

    if (error) throw error;

    return (users || []).map(user => ({
      user_id: user.id,
      mention_type: 'user',
      mention_text: user.email,
    }));
  } catch (error) {
    console.error('Error resolving mentions:', error);
    return [];
  }
}

/**
 * Log messaging activity (internal helper)
 */
async function logMessageActivity(
  userId: string,
  workspaceId: string,
  actionType: MessageActivityType,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await supabase
      .from('message_activity_log')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        message_id: metadata.message_id,
        thread_id: metadata.thread_id,
        action_type: actionType,
        metadata: metadata,
      });
  } catch (error) {
    console.error('Error logging message activity:', error);
    // Don't throw here as this is not critical
  }
}