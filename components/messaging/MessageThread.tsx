/**
 * MessageThread Component
 * Thread display with real-time updates and message grouping
 * Phase 4 of Collaborative Workspace System for Genera
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Hash, 
  Pin, 
  Lock, 
  Archive, 
  MessageCircle, 
  Users, 
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  Settings
} from 'lucide-react';
import {
  ThreadWithDetails,
  MessageWithDetails,
  MessageCompositionData,
  MessageFilters,
  MessagingPermissions,
  ReactionType,
  THREAD_CATEGORIES,
} from '../../types/messaging';
import {
  getThreadMessages,
  createMessage,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  markMentionsAsRead,
  formatRelativeTime,
  getThreadCategoryConfig,
} from '../../utils/messagingUtils';
import MessageCard from './MessageCard';
import MessageComposer from './MessageComposer';

interface MessageThreadProps {
  thread: ThreadWithDetails;
  workspaceId: string;
  currentUserId: string;
  permissions: MessagingPermissions;
  onThreadUpdate?: (thread: ThreadWithDetails) => void;
  onMessageSent?: (message: MessageWithDetails) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  mentionSuggestions?: any[];
  onRequestMentions?: (query: string) => void;
  className?: string;
}

const MessageThread: React.FC<MessageThreadProps> = ({
  thread,
  workspaceId,
  currentUserId,
  permissions,
  onThreadUpdate,
  onMessageSent,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  mentionSuggestions = [],
  onRequestMentions,
  className = '',
}) => {
  // Component state
  const [messages, setMessages] = useState<MessageWithDetails[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<MessageWithDetails | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageWithDetails | null>(null);
  const [showThreadInfo, setShowThreadInfo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Load messages for thread
  const loadMessages = useCallback(async (filters: MessageFilters = {}) => {
    try {
      setLoadingMessages(true);
      setError(null);
      
      const { messages: threadMessages } = await getThreadMessages(thread.id, {
        ...filters,
        limit: 50,
        sort_order: 'asc',
      });

      // Enhance messages with user reactions and mentions
      const enhancedMessages = threadMessages.map(message => ({
        ...message,
        user_reaction: message.reactions.find(r => 
          r.users.some(u => u.user_id === currentUserId)
        )?.reaction_type,
        is_mentioned: message.mentions.some(m => m.mentioned_user_id === currentUserId),
      }));

      setMessages(enhancedMessages);

      // Mark mentions as read
      const mentionedMessages = enhancedMessages.filter(m => m.is_mentioned);
      if (mentionedMessages.length > 0) {
        await markMentionsAsRead(currentUserId, mentionedMessages.map(m => m.id));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Error al cargar los mensajes');
    } finally {
      setLoadingMessages(false);
    }
  }, [thread.id, currentUserId]);

  // Handle sending new message
  const handleSendMessage = useCallback(async (messageData: MessageCompositionData) => {
    try {
      setIsSubmitting(true);
      const newMessage = await createMessage(messageData, currentUserId);
      
      // Add to local messages
      setMessages(prev => [...prev, newMessage]);
      
      // Clear reply state
      setReplyToMessage(null);
      
      // Notify parent
      if (onMessageSent) {
        onMessageSent(newMessage);
      }

      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUserId, onMessageSent]);

  // Handle editing message
  const handleEditMessage = useCallback(async (messageId: string, content: string) => {
    try {
      const updatedMessage = await editMessage(messageId, { content }, currentUserId);
      
      // Update local messages
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updatedMessage } : msg
      ));
      
      setEditingMessage(null);
    } catch (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  }, [currentUserId]);

  // Handle deleting message
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este mensaje?')) {
      return;
    }

    try {
      await deleteMessage(messageId, currentUserId);
      
      // Remove from local messages
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Error al eliminar el mensaje');
    }
  }, [currentUserId]);

  // Handle reaction toggle
  const handleReactionToggle = useCallback(async (messageId: string, reactionType: ReactionType) => {
    try {
      const { added } = await toggleMessageReaction(messageId, reactionType, currentUserId);
      
      // Update local message reactions
      setMessages(prev => prev.map(msg => {
        if (msg.id !== messageId) return msg;
        
        const existingReaction = msg.reactions.find(r => r.reaction_type === reactionType);
        let updatedReactions = [...msg.reactions];
        
        if (existingReaction) {
          if (added) {
            // Add user to existing reaction
            existingReaction.count += 1;
            existingReaction.users.push({
              user_id: currentUserId,
              user_name: 'Tú', // Will be replaced with actual name
            });
            existingReaction.user_reacted = true;
          } else {
            // Remove user from existing reaction
            existingReaction.count = Math.max(0, existingReaction.count - 1);
            existingReaction.users = existingReaction.users.filter(u => u.user_id !== currentUserId);
            existingReaction.user_reacted = false;
            
            // Remove reaction if no users left
            if (existingReaction.count === 0) {
              updatedReactions = updatedReactions.filter(r => r.reaction_type !== reactionType);
            }
          }
        } else if (added) {
          // Add new reaction
          updatedReactions.push({
            reaction_type: reactionType,
            count: 1,
            users: [{
              user_id: currentUserId,
              user_name: 'Tú',
            }],
            user_reacted: true,
          });
        }
        
        return {
          ...msg,
          reactions: updatedReactions,
          user_reaction: added ? reactionType : undefined,
        };
      }));
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  }, [currentUserId]);

  // Handle reply
  const handleReply = useCallback((message: MessageWithDetails) => {
    setReplyToMessage(message);
    setEditingMessage(null);
  }, []);

  // Handle edit
  const handleEdit = useCallback((message: MessageWithDetails) => {
    setEditingMessage(message);
    setReplyToMessage(null);
  }, []);

  // Cancel reply
  const handleCancelReply = useCallback(() => {
    setReplyToMessage(null);
  }, []);

  // Cancel edit
  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load messages on mount and thread change
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Group messages by date for better organization
  const groupMessagesByDate = (messages: MessageWithDetails[]) => {
    const groups: { date: string; messages: MessageWithDetails[] }[] = [];
    let currentDate = '';
    let currentGroup: MessageWithDetails[] = [];

    messages.forEach(message => {
      const messageDate = new Date(message.created_at).toDateString();
      
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: currentGroup });
        }
        currentDate = messageDate;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  };

  // Format date for group headers
  const formatGroupDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  };

  const categoryConfig = getThreadCategoryConfig(thread.category);
  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Thread header */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: categoryConfig.color + '20' }}
              >
                <Hash className="w-4 h-4" style={{ color: categoryConfig.color }} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-semibold text-gray-900">{thread.thread_title}</h2>
                  {thread.is_pinned && (
                    <span title="Hilo fijado">
                      <Pin className="w-4 h-4 text-yellow-500" />
                    </span>
                  )}
                  {thread.is_locked && (
                    <span title="Hilo bloqueado">
                      <Lock className="w-4 h-4 text-red-500" />
                    </span>
                  )}
                  {thread.is_archived && (
                    <span title="Hilo archivado">
                      <Archive className="w-4 h-4 text-gray-500" />
                    </span>
                  )}
                </div>
                {thread.description && (
                  <p className="text-sm text-gray-600">{thread.description}</p>
                )}
                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                  <div className="flex items-center space-x-1">
                    <MessageCircle className="w-3 h-3" />
                    <span>{thread.message_count} mensajes</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{thread.participant_count} participantes</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>Último mensaje {formatRelativeTime(thread.last_message_at)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowThreadInfo(!showThreadInfo)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Información del hilo"
              >
                {showThreadInfo ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {permissions.can_pin_threads && (
                <button
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Configuración del hilo"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Thread info panel */}
          {showThreadInfo && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Categoría:</span>
                  <div className="flex items-center space-x-2 mt-1">
                    <span 
                      className="px-2 py-1 rounded text-white text-xs"
                      style={{ backgroundColor: categoryConfig.color }}
                    >
                      {categoryConfig.label}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Creador:</span>
                  <div className="text-gray-600 mt-1">{thread.creator_name}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Creado:</span>
                  <div className="text-gray-600 mt-1">
                    {new Date(thread.created_at).toLocaleDateString('es-CL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Participantes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {thread.participants.slice(0, 5).map(participant => (
                      <span
                        key={participant.user_id}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                      >
                        {participant.user_name}
                      </span>
                    ))}
                    {thread.participants.length > 5 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                        +{thread.participants.length - 5} más
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        {/* Loading state */}
        {loadingMessages && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Cargando mensajes...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
              <button
                onClick={() => loadMessages()}
                className="ml-2 text-red-600 hover:text-red-800 underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* Load more button */}
        {hasMore && !loadingMessages && (
          <div className="flex justify-center py-4">
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Cargar mensajes anteriores</span>
            </button>
          </div>
        )}

        {/* Messages */}
        {!loadingMessages && !error && (
          <div className="px-4 py-2 space-y-4">
            {messageGroups.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <div className="text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No hay mensajes en este hilo</p>
                  <p className="text-sm">¡Sé el primero en escribir algo!</p>
                </div>
              </div>
            ) : (
              messageGroups.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {/* Date separator */}
                  <div className="flex items-center justify-center py-2">
                    <div className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium">
                      {formatGroupDate(group.date)}
                    </div>
                  </div>
                  
                  {/* Messages in this date group */}
                  <div className="space-y-4">
                    {group.messages.map((message, messageIndex) => (
                      <MessageCard
                        key={message.id}
                        message={message}
                        currentUserId={currentUserId}
                        permissions={permissions}
                        onReply={handleReply}
                        onEdit={handleEdit}
                        onDelete={handleDeleteMessage}
                        onReaction={handleReactionToggle}
                        showReplyThread={true}
                        className="py-2"
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Scroll target */}
        <div ref={messagesEndRef} />
      </div>

      {/* Message composer */}
      {permissions.can_send_messages && !thread.is_locked && !thread.is_archived && (
        <div className="flex-shrink-0 border-t border-gray-200 p-4">
          <MessageComposer
            threadId={thread.id}
            workspaceId={workspaceId}
            onSendMessage={handleSendMessage}
            replyToMessage={replyToMessage}
            onCancelReply={handleCancelReply}
            editingMessage={editingMessage}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleEditMessage}
            mentionSuggestions={mentionSuggestions}
            onRequestMentions={onRequestMentions}
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* Thread locked/archived message */}
      {(thread.is_locked || thread.is_archived) && (
        <div className="flex-shrink-0 border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-center space-x-2 text-gray-500">
            {thread.is_locked ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Este hilo está bloqueado</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Este hilo está archivado</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageThread;