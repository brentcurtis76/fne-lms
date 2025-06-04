/**
 * Simplified Messaging System Utilities
 * Phase 4 of Collaborative Workspace System for FNE LMS
 * Minimal version to get messaging working without complex functions
 */

import { supabase } from '../lib/supabase';
import {
  ThreadWithDetails,
  MessageWithDetails,
  MessageFilters,
  ThreadFilters,
  MessagingPermissions,
  ThreadCreationData,
  MessageCompositionData,
  ThreadCategory,
  MessageType,
  THREAD_CATEGORIES,
} from '../types/messaging';

// =============================================================================
// SIMPLIFIED THREAD FUNCTIONS
// =============================================================================

/**
 * Get threads for a workspace (simplified)
 */
export async function getWorkspaceThreads(
  workspaceId: string,
  filters: ThreadFilters = {}
): Promise<ThreadWithDetails[]> {
  try {
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
      query = query.eq('category', filters.category);
    }
    
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'pinned') {
        query = query.eq('is_pinned', true);
      } else if (filters.status === 'active') {
        query = query.eq('is_locked', false);
      }
    }

    // Apply sorting
    const sortBy = filters.sort_by || 'last_message_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const { data, error } = await query;

    if (error) {
      // Gracefully handle missing tables
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Message threads table not found - feature not yet implemented');
      } else {
        console.error('Error fetching threads:', error);
      }
      return [];
    }

    // Transform to ThreadWithDetails format
    return (data || []).map(thread => ({
      ...thread,
      creator_name: 'Usuario',
      creator_email: '',
      latest_message: null, // Will be populated separately if needed
      participants: [],
      unread_count: 0,
      category_config: THREAD_CATEGORIES.find(cat => cat.type === thread.category) || THREAD_CATEGORIES[0]
    }));

  } catch (error) {
    console.error('Error in getWorkspaceThreads:', error);
    return [];
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

    // Apply sorting
    const sortBy = filters.sort_by || 'created_at';
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

    // Transform to MessageWithDetails format
    return (data || []).map(message => ({
      ...message,
      author_name: 'Usuario',
      author_email: '',
      author_avatar: null,
      reply_to_message: null,
      reactions: [],
      attachments: [],
      mentions: [],
      user_reaction: undefined,
      is_mentioned: false
    }));

  } catch (error) {
    console.error('Error in getWorkspaceMessages:', error);
    return [];
  }
}

/**
 * Create a new thread (simplified)
 */
export async function createThread(
  workspaceId: string,
  threadData: ThreadCreationData,
  userId: string
): Promise<ThreadWithDetails> {
  try {
    // Create the thread
    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        workspace_id: workspaceId,
        thread_title: threadData.thread_title,
        description: threadData.description,
        category: threadData.category,
        created_by: userId,
        is_pinned: false,
        is_locked: false,
        is_archived: false,
        last_message_at: new Date().toISOString(),
        message_count: 1,
        participant_count: 1
      })
      .select()
      .single();

    if (threadError) {
      // Gracefully handle missing tables
      if (threadError?.code === '42P01' || threadError?.message?.includes('does not exist')) {
        console.warn('Message threads table not found - feature not yet implemented');
        throw new Error('Messaging feature not yet implemented');
      } else {
        throw threadError;
      }
    }

    // Create initial message
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
    }

    return {
      ...thread,
      creator_name: 'Usuario',
      creator_email: '',
      latest_message: null,
      participants: [],
      unread_count: 0,
      category_config: THREAD_CATEGORIES.find(cat => cat.type === thread.category) || THREAD_CATEGORIES[0]
    };

  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
}

/**
 * Send a message (simplified)
 */
export async function sendMessage(
  workspaceId: string,
  messageData: MessageCompositionData,
  userId: string
): Promise<MessageWithDetails> {
  try {
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

    // Skip user info query

    // Update thread last message time
    await supabase
      .from('message_threads')
      .update({ 
        last_message_at: message.created_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', messageData.thread_id);

    return {
      ...message,
      author_name: 'Usuario',
      author_email: '',
      author_avatar: null,
      reply_to_message: null,
      reactions: [],
      attachments: [],
      mentions: [],
      user_reaction: undefined,
      is_mentioned: false
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
  workspaceId: string,
  callbacks: {
    onMessage?: (message: MessageWithDetails) => void;
    onThread?: (thread: ThreadWithDetails) => void;
    onReaction?: (reaction: any) => void;
  }
) {
  try {
    // Subscribe to new messages
    const messageSubscription = supabase
      .channel(`workspace-messages-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          if (callbacks.onMessage) {
            // Transform payload to MessageWithDetails format
            const message = {
              ...payload.new,
              author_name: 'Usuario',
              author_email: '',
              author_avatar: null,
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
      .channel(`workspace-threads-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          if (callbacks.onThread) {
            // Transform payload to ThreadWithDetails format
            const thread = {
              ...payload.new,
              creator_name: 'Usuario',
              creator_email: '',
              latest_message: null,
              participants: [],
              unread_count: 0,
              category_config: THREAD_CATEGORIES.find(cat => cat.type === payload.new.category) || THREAD_CATEGORIES[0]
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