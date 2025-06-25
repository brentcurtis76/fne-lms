/**
 * MessageCard Component
 * Individual message display with reactions, replies, and attachments
 * Phase 4 of Collaborative Workspace System for FNE LMS
 */

import React, { useState, useCallback } from 'react';
import { 
  MoreHorizontal, 
  Reply, 
  Edit3, 
  Trash2, 
  Download, 
  Eye, 
  Heart, 
  ThumbsUp, 
  Lightbulb, 
  PartyPopper,
  HelpCircle,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  ExternalLink,
  Calendar,
  User
} from 'lucide-react';
import {
  MessageWithDetails,
  MessageReactionSummary,
  ReactionType,
  MessagingPermissions,
  REACTION_TYPES,
} from '../../types/messaging';
import {
  formatRelativeTime,
  formatFileSize,
  getReactionEmoji,
  getReactionLabel,
} from '../../utils/messagingUtils';

interface MessageCardProps {
  message: MessageWithDetails;
  currentUserId: string;
  permissions: MessagingPermissions;
  onReply?: (message: MessageWithDetails) => void;
  onEdit?: (message: MessageWithDetails) => void;
  onDelete?: (messageId: string) => void;
  onReaction?: (messageId: string, reactionType: ReactionType) => void;
  onDownloadAttachment?: (attachment: any) => void;
  onPreviewAttachment?: (attachment: any) => void;
  onUserClick?: (userId: string) => void;
  onMentionClick?: (mention: string) => void;
  showReplyThread?: boolean;
  isReply?: boolean;
  className?: string;
}

const MessageCard: React.FC<MessageCardProps> = ({
  message,
  currentUserId,
  permissions,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onDownloadAttachment,
  onPreviewAttachment,
  onUserClick,
  onMentionClick,
  showReplyThread = true,
  isReply = false,
  className = '',
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [expandedReactions, setExpandedReactions] = useState<Record<ReactionType, boolean>>({} as Record<ReactionType, boolean>);

  // Check if current user is author
  const isOwnMessage = message.author_id === currentUserId;
  const isMentioned = message.mentions.some(mention => mention.mentioned_user_id === currentUserId);

  // Handle reaction toggle
  const handleReactionToggle = useCallback((reactionType: ReactionType) => {
    if (onReaction) {
      onReaction(message.id, reactionType);
    }
    setShowReactions(false);
  }, [message.id, onReaction]);

  // Get file icon by mime type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (mimeType.startsWith('video/')) return <Video className="w-4 h-4" />;
    if (mimeType.startsWith('audio/')) return <Music className="w-4 h-4" />;
    if (mimeType.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
    if (mimeType.includes('word')) return <FileText className="w-4 h-4 text-blue-500" />;
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return <FileText className="w-4 h-4 text-green-500" />;
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return <FileText className="w-4 h-4 text-orange-500" />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  // Render message content with mention highlighting
  const renderContent = (content: string) => {
    if (!content) return null;

    // Simple mention highlighting - could be enhanced with proper parsing
    const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
    const parts = content.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        // This is a mention
        return (
          <button
            key={index}
            onClick={() => onMentionClick && onMentionClick(part)}
            className="text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-1 rounded"
          >
            @{part}
          </button>
        );
      }
      return part;
    });
  };

  // Render reaction button
  const renderReactionButton = (reactionType: ReactionType) => {
    const reactionSummary = message.reactions.find(r => r.reaction_type === reactionType);
    const userReacted = reactionSummary?.user_reacted || false;
    const count = reactionSummary?.count || 0;
    const emoji = getReactionEmoji(reactionType);
    
    return (
      <button
        key={reactionType}
        onClick={() => handleReactionToggle(reactionType)}
        onMouseEnter={() => setExpandedReactions(prev => ({ ...prev, [reactionType]: true }))}
        onMouseLeave={() => setExpandedReactions(prev => ({ ...prev, [reactionType]: false }))}
        className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs transition-colors relative ${
          userReacted 
            ? 'bg-blue-100 text-blue-700 border border-blue-300' 
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
        title={getReactionLabel(reactionType)}
      >
        <span>{emoji}</span>
        {count > 0 && <span className="font-medium">{count}</span>}
        
        {/* Tooltip with users who reacted */}
        {expandedReactions[reactionType] && reactionSummary && reactionSummary.users.length > 0 && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
            {reactionSummary.users.slice(0, 5).map(user => user.user_name).join(', ')}
            {reactionSummary.users.length > 5 && ` y ${reactionSummary.users.length - 5} más`}
          </div>
        )}
      </button>
    );
  };

  return (
    <div 
      className={`group relative ${isReply ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''} ${
        isMentioned ? 'bg-blue-50 border-l-4 border-blue-500 pl-4' : ''
      } ${className}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Reply indicator */}
      {message.reply_to_message && showReplyThread && (
        <div className="mb-2 p-2 bg-gray-50 border-l-3 border-gray-300 rounded-r text-sm">
          <div className="flex items-center space-x-2 text-gray-600 mb-1">
            <Reply className="w-3 h-3" />
            <span className="font-medium">{message.reply_to_message.author_name}</span>
            <span className="text-gray-400">{formatRelativeTime(message.reply_to_message.created_at)}</span>
          </div>
          <div className="text-gray-700 truncate">
            {message.reply_to_message.content.substring(0, 100)}...
          </div>
        </div>
      )}

      <div className="flex space-x-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {message.author_avatar ? (
            <img
              src={message.author_avatar}
              alt={message.author_name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#00365b] flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center space-x-2 mb-1">
            <button
              onClick={() => onUserClick && onUserClick(message.author_id)}
              className="font-medium text-gray-900 hover:text-blue-600 text-sm"
            >
              {message.author_name}
            </button>
            <span className="text-xs text-gray-500">{formatRelativeTime(message.created_at)}</span>
            {message.is_edited && (
              <span className="text-xs text-gray-400 italic">(editado)</span>
            )}
            {message.message_type === 'system' && (
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                Sistema
              </span>
            )}
            {message.message_type === 'announcement' && (
              <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs">
                Anuncio
              </span>
            )}
          </div>

          {/* Content */}
          <div className="text-gray-900 text-sm leading-relaxed mb-2">
            {renderContent(message.content)}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="space-y-2 mb-3">
              {/* Group attachments by type */}
              {message.attachments.filter(att => att.mime_type && att.mime_type.startsWith('image/')).length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {message.attachments
                    .filter(att => att.mime_type && att.mime_type.startsWith('image/'))
                    .map((attachment) => (
                      <div key={attachment.id} className="relative group">
                        <img
                          src={attachment.storage_path}
                          alt={attachment.file_name}
                          className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => onPreviewAttachment && onPreviewAttachment(attachment)}
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownloadAttachment && onDownloadAttachment(attachment);
                            }}
                            className="bg-black/50 text-white p-1 rounded hover:bg-black/70"
                            title="Descargar"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              
              {/* Non-image attachments */}
              {message.attachments.filter(att => !att.mime_type || !att.mime_type.startsWith('image/')).map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex-shrink-0 text-gray-500">
                    {getFileIcon(attachment.mime_type || 'application/octet-stream')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {attachment.file_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatFileSize(attachment.file_size || 0)}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {onDownloadAttachment && (
                      <button
                        onClick={() => onDownloadAttachment(attachment)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Descargar"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {message.reactions.map((reactionSummary) => 
                renderReactionButton(reactionSummary.reaction_type)
              )}
            </div>
          )}

          {/* Actions */}
          <div className={`flex items-center space-x-2 transition-opacity ${
            showActions ? 'opacity-100' : 'opacity-0'
          }`}>
            {/* Add reaction */}
            <div className="relative">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100"
                title="Reaccionar"
              >
                😊
              </button>
              
              {/* Reaction picker */}
              {showReactions && (
                <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex space-x-1 z-10">
                  {REACTION_TYPES.map((reaction) => (
                    <button
                      key={reaction.type}
                      onClick={() => handleReactionToggle(reaction.type)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded"
                      title={reaction.label}
                    >
                      {reaction.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reply */}
            {permissions.can_send_messages && onReply && (
              <button
                onClick={() => onReply(message)}
                className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100 flex items-center space-x-1"
                title="Responder"
              >
                <Reply className="w-3 h-3" />
                <span>Responder</span>
              </button>
            )}

            {/* Edit (own messages only) */}
            {isOwnMessage && permissions.can_edit_own_messages && onEdit && (
              <button
                onClick={() => onEdit(message)}
                className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100 flex items-center space-x-1"
                title="Editar"
              >
                <Edit3 className="w-3 h-3" />
                <span>Editar</span>
              </button>
            )}

            {/* Delete (own messages or moderators) */}
            {(isOwnMessage && permissions.can_delete_own_messages) || permissions.can_moderate_messages ? (
              <button
                onClick={() => onDelete && onDelete(message.id)}
                className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-gray-100 flex items-center space-x-1"
                title="Eliminar"
              >
                <Trash2 className="w-3 h-3" />
                <span>Eliminar</span>
              </button>
            ) : null}

            {/* More actions */}
            <button
              className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100"
              title="Más opciones"
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Mention indicator */}
      {isMentioned && (
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-r"></div>
      )}
    </div>
  );
};

export default MessageCard;