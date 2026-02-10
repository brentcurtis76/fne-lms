/**
 * Simplified Messaging System Utilities
 * Phase 4 of Collaborative Workspace System for Genera
 * Minimal version to get messaging working without complex functions
 */

import { supabase } from '../lib/supabase-wrapper';
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
    const sortBy = filters.sort_by || 'last_message_at';
    const sortOrder = filters.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

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

    // Get creator information for all threads
    const creatorIds = Array.from(new Set((data || []).map(thread => thread.created_by)));
    let creators: Record<string, any> = {};
    
    if (creatorIds.length > 0) {
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', creatorIds);
      
      if (creatorData) {
        creators = creatorData.reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Transform to ThreadWithDetails format
    return (data || []).map(thread => {
      const creator = creators[thread.created_by] || {};
      const creatorName = creator.first_name && creator.last_name 
        ? `${creator.first_name} ${creator.last_name}`
        : creator.email || 'Usuario';
      
      // Handle custom category
      let categoryConfig = THREAD_CATEGORIES.find(cat => cat.type === thread.category);
      // For now, skip custom category handling until column is added
      if (!categoryConfig) {
        categoryConfig = THREAD_CATEGORIES[0]; // Default to general
      }
        
      return {
        ...thread,
        creator_name: creatorName,
        creator_email: creator.email || '',
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

    // Get author information for all messages
    const authorIds = Array.from(new Set((data || []).map(message => message.author_id)));
    let authors: Record<string, any> = {};
    
    if (authorIds.length > 0) {
      const { data: authorData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', authorIds);
      
      if (authorData) {
        authors = authorData.reduce((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Get attachments for all messages
    const messageIds = (data || []).map(msg => msg.id);
    let attachmentsByMessage: Record<string, any[]> = {};

    if (messageIds.length > 0) {
      const { data: attachments } = await supabase
        .from('message_attachments')
        .select('*')
        .in('message_id', messageIds)
        .eq('is_active', true);

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

    // Get reactions for all messages with user profile info
    let reactionsByMessage: Record<string, any[]> = {};

    if (messageIds.length > 0) {
      const { data: reactions, error: reactionsError } = await supabase
        .from('message_reactions')
        .select(`
          id,
          message_id,
          user_id,
          reaction_type,
          created_at,
          profiles:user_id (
            first_name,
            last_name
          )
        `)
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

          // Add to count and users list
          reactionGroup.count++;
          const profile = reaction.profiles as any;
          const userName = profile?.first_name && profile?.last_name
            ? `${profile.first_name} ${profile.last_name}`
            : 'Usuario';
          reactionGroup.users.push({ user_id: reaction.user_id, user_name: userName });

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
        // Get author info for reply messages
        const replyAuthorIds = Array.from(new Set(replyTos.map(r => r.author_id)));
        let replyAuthors: Record<string, any> = {};

        if (replyAuthorIds.length > 0) {
          const { data: replyAuthorData } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', replyAuthorIds);

          if (replyAuthorData) {
            replyAuthors = replyAuthorData.reduce((acc, p) => {
              acc[p.id] = p;
              return acc;
            }, {} as Record<string, any>);
          }
        }

        replyTos.forEach(reply => {
          const replyAuthor = replyAuthors[reply.author_id] || {};
          const replyAuthorName = replyAuthor.first_name && replyAuthor.last_name
            ? `${replyAuthor.first_name} ${replyAuthor.last_name}`
            : 'Usuario';
          replyToMessages[reply.id] = {
            id: reply.id,
            content: reply.content,
            author_name: replyAuthorName,
            created_at: reply.created_at
          };
        });
      }
    }

    // Transform to MessageWithDetails format
    return (data || []).map(message => {
      const author = authors[message.author_id] || {};
      const authorName = author.first_name && author.last_name
        ? `${author.first_name} ${author.last_name}`
        : author.email || 'Usuario';

      return {
        ...message,
        author_name: authorName,
        author_email: author.email || '',
        author_avatar: author.avatar_url || null,
        reply_to_message: message.reply_to_id ? replyToMessages[message.reply_to_id] || null : null,
        reactions: reactionsByMessage[message.id] || [],
        attachments: attachmentsByMessage[message.id] || [],
        mentions: message.mentions || [],
        user_reaction: undefined,
        is_mentioned: false
      };
    });

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
    // First get the user's profile to get their name
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();
      
    const creatorName = userProfile?.first_name && userProfile?.last_name 
      ? `${userProfile.first_name} ${userProfile.last_name}`
      : userProfile?.email || 'Usuario';

    // Create the thread (without custom_category_name for now)
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
      .select('*')
      .single();

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

    // Handle custom category
    let categoryConfig = THREAD_CATEGORIES.find(cat => cat.type === thread.category);
    // For now, skip custom category handling until column is added
    if (!categoryConfig) {
      categoryConfig = THREAD_CATEGORIES[0]; // Default to general
    }

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

/**
 * Send a message (simplified)
 */
export async function sendMessage(
  workspaceId: string,
  messageData: MessageCompositionData,
  userId: string
): Promise<MessageWithDetails> {
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
    if (messageData.attachments && messageData.attachments.length > 0) {
      for (const file of messageData.attachments) {
        try {
          // Generate unique file name
          const fileExt = file.name.split('.').pop();
          const fileName = `${workspaceId}/${message.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          // Upload to storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('message-attachments')
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false
            });

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
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
          }
        } catch (attachmentErr) {
          console.error('Error processing attachment:', attachmentErr);
        }
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

    // Handle mentions and create notifications
    if (messageData.mentions && messageData.mentions.length > 0) {
      await handleMentions(message.id, messageData.mentions, userId, workspaceId, authorName, messageData.content, messageData.reply_to_id);
    } else if (messageData.reply_to_id) {
      // Even if no mentions, handle reply notification
      await handleMentions(message.id, [], userId, workspaceId, authorName, messageData.content, messageData.reply_to_id);
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
        async (payload) => {
          if (callbacks.onMessage) {
            // Fetch author profile for the new message
            const authorId = payload.new.author_id;
            let authorName = 'Usuario';
            let authorEmail = '';
            let authorAvatar = null;

            if (authorId) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name, email, avatar_url')
                .eq('id', authorId)
                .single();

              if (profile) {
                authorName = profile.first_name && profile.last_name
                  ? `${profile.first_name} ${profile.last_name}`
                  : profile.email || 'Usuario';
                authorEmail = profile.email || '';
                authorAvatar = profile.avatar_url || null;
              }
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
      .channel(`workspace-threads-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_threads',
          filter: `workspace_id=eq.${workspaceId}`
        },
        async (payload) => {
          if (callbacks.onThread) {
            // Fetch creator profile for the new thread
            const creatorId = payload.new.created_by;
            let creatorName = 'Usuario';
            let creatorEmail = '';

            if (creatorId) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name, email')
                .eq('id', creatorId)
                .single();

              if (profile) {
                creatorName = profile.first_name && profile.last_name
                  ? `${profile.first_name} ${profile.last_name}`
                  : profile.email || 'Usuario';
                creatorEmail = profile.email || '';
              }
            }

            // Transform payload to ThreadWithDetails format
            const thread = {
              ...payload.new,
              creator_name: creatorName,
              creator_email: creatorEmail,
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

/**
 * Handle mentions and create notifications
 */
async function handleMentions(
  messageId: string,
  mentions: string[],
  senderId: string,
  workspaceId: string,
  senderName: string,
  messageContent: string,
  replyToId?: string
): Promise<void> {
  try {
    // Get workspace and thread information
    const { data: messageData } = await supabase
      .from('community_messages')
      .select('thread_id')
      .eq('id', messageId)
      .single();

    if (!messageData?.thread_id) return;

    // Get thread information
    const { data: threadData } = await supabase
      .from('message_threads')
      .select('thread_title, workspace_id')
      .eq('id', messageData.thread_id)
      .single();

    if (!threadData) return;

    const threadTitle = threadData.thread_title;
    
    // Get workspace name
    const { data: workspaceData } = await supabase
      .from('community_workspaces')
      .select('name')
      .eq('id', threadData.workspace_id)
      .single();
    
    const communityName = workspaceData?.name || 'la comunidad';

    // Process each mention
    for (const mentionedUserId of mentions) {
      // Skip if user is mentioning themselves
      if (mentionedUserId === senderId) continue;

      // Create notification for the mentioned user
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: mentionedUserId,
          type: 'mention_in_message',
          title: `${senderName} te mencionó en un mensaje`,
          message: `Te han mencionado en el hilo "${threadTitle}" en ${communityName}`,
          metadata: {
            message_id: messageId,
            thread_id: messageData.thread_id,
            workspace_id: workspaceId,
            sender_id: senderId,
            sender_name: senderName,
            message_preview: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : '')
          },
          priority: 'medium',
          action_url: `/community/workspace?section=messaging&thread=${messageData.thread_id}&message=${messageId}`,
          is_read: false,
          created_at: new Date().toISOString()
        });
      
      if (notifError) {
        console.error('Error creating mention notification:', notifError);
      }
    }

    // Also check if someone is replying to a message where the original author should be notified
    if (replyToId) {
      const { data: parentMessage } = await supabase
        .from('community_messages')
        .select('author_id, content')
        .eq('id', replyToId)
        .single();

      if (parentMessage && parentMessage.author_id !== senderId) {
        // Notify the original message author about the reply
        const { error: replyNotifError } = await supabase
          .from('notifications')
          .insert({
            user_id: parentMessage.author_id,
            type: 'reply_to_message',
            title: `${senderName} respondió a tu mensaje`,
            message: `Nueva respuesta en el hilo "${threadTitle}" en ${communityName}`,
            metadata: {
              message_id: messageId,
              thread_id: messageData.thread_id,
              workspace_id: workspaceId,
              sender_id: senderId,
              sender_name: senderName,
              original_message_preview: parentMessage.content.substring(0, 50) + '...',
              reply_preview: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : '')
            },
            priority: 'medium',
            action_url: `/community/workspace?section=messaging&thread=${messageData.thread_id}&message=${messageId}`,
            is_read: false,
            created_at: new Date().toISOString()
          });
        
        if (replyNotifError) {
          console.error('Error creating reply notification:', replyNotifError);
        }
      }
    }
  } catch (error) {
    console.error('Error handling mentions:', error);
    // Don't throw - we don't want mention errors to prevent message sending
  }
}