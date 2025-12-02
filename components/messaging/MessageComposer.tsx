/**
 * MessageComposer Component
 * Professional message composition interface with rich text editing, mentions, and attachments
 * Phase 4 of Collaborative Workspace System for FNE LMS
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, 
  Paperclip, 
  Smile, 
  X, 
  Reply, 
  AtSign, 
  Image, 
  FileText, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import {
  MessageCompositionData,
  MessageWithDetails,
  AttachmentUploadProgress,
  MessageValidation,
  MentionSuggestion,
  DEFAULT_MESSAGING_CONFIG,
} from '../../types/messaging';
import {
  validateMessage,
  extractMentionsFromContent,
  formatFileSize,
  isValidAttachment,
} from '../../utils/messagingUtils';
import MentionPicker from './MentionPicker';

interface MessageComposerProps {
  threadId: string;
  workspaceId: string;
  onSendMessage: (messageData: MessageCompositionData) => Promise<void>;
  replyToMessage?: MessageWithDetails;
  onCancelReply?: () => void;
  editingMessage?: MessageWithDetails;
  onCancelEdit?: () => void;
  onSaveEdit?: (messageId: string, content: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  allowAttachments?: boolean;
  allowMentions?: boolean;
  mentionSuggestions?: MentionSuggestion[];
  onRequestMentions?: (query: string) => void;
}

const MessageComposer: React.FC<MessageComposerProps> = ({
  threadId,
  workspaceId,
  onSendMessage,
  replyToMessage,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onSaveEdit,
  placeholder = "Escribe un mensaje...",
  disabled = false,
  maxLength = DEFAULT_MESSAGING_CONFIG.max_message_length,
  allowAttachments = true,
  allowMentions = true,
  mentionSuggestions = [],
  onRequestMentions,
}) => {
  // Component state
  const [content, setContent] = useState(editingMessage?.content || '');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<AttachmentUploadProgress[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<{ start: number; end: number } | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [validation, setValidation] = useState<MessageValidation | null>(null);
  const [mentionedUsers, setMentionedUsers] = useState<Map<string, string>>(new Map()); // Map of display_name -> user_id

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mentionPickerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, []);

  // Handle content change
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    // Validate message
    const messageData: MessageCompositionData = {
      content: newContent,
      thread_id: threadId,
      attachments,
    };
    setValidation(validateMessage(messageData));

    // Handle mention detection (includes underscores for multi-word names like @Bob_Dylan)
    if (allowMentions && onRequestMentions) {
      const cursorPosition = e.target.selectionStart;
      const textBeforeCursor = newContent.substring(0, cursorPosition);
      const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9._-]*)$/);
      
      if (mentionMatch) {
        const query = mentionMatch[1];
        const start = cursorPosition - mentionMatch[0].length;
        const end = cursorPosition;
        
        setMentionQuery(query);
        setMentionPosition({ start, end });
        setShowMentionPicker(true);
        setSelectedMentionIndex(0);
        onRequestMentions(query);
      } else {
        setShowMentionPicker(false);
        setMentionPosition(null);
      }
    }
  }, [threadId, attachments, allowMentions, onRequestMentions]);

  // Handle key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (showMentionPicker) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => Math.min(prev + 1, mentionSuggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (mentionSuggestions[selectedMentionIndex]) {
          insertMention(mentionSuggestions[selectedMentionIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowMentionPicker(false);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      handleSubmit();
    }
  }, [showMentionPicker, selectedMentionIndex, mentionSuggestions, disabled]);

  // Insert mention
  const insertMention = useCallback((mention: MentionSuggestion) => {
    if (!mentionPosition) return;

    const beforeMention = content.substring(0, mentionPosition.start);
    const afterMention = content.substring(mentionPosition.end);
    // Replace spaces with underscores for reliable parsing, but display will show original name
    const mentionHandle = mention.display_name.replace(/\s+/g, '_');
    const mentionText = `@${mentionHandle}`;
    const newContent = beforeMention + mentionText + ' ' + afterMention;

    setContent(newContent);
    setShowMentionPicker(false);
    setMentionPosition(null);

    // Track the mentioned user's ID using the handle format (with underscores)
    setMentionedUsers(prev => {
      const newMap = new Map(prev);
      newMap.set(mentionHandle, mention.id);
      return newMap;
    });
    
    // Focus and position cursor
    if (textareaRef.current) {
      const newCursorPosition = mentionPosition.start + mentionText.length + 1;
      textareaRef.current.focus();
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition);
      }, 0);
    }
  }, [content, mentionPosition]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      if (!isValidAttachment(file)) {
        alert(`Archivo no válido: ${file.name}`);
        return false;
      }
      return true;
    });

    if (attachments.length + validFiles.length > DEFAULT_MESSAGING_CONFIG.max_attachments_per_message) {
      alert(`No se pueden adjuntar más de ${DEFAULT_MESSAGING_CONFIG.max_attachments_per_message} archivos`);
      return;
    }

    setAttachments(prev => [...prev, ...validFiles]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachments]);

  // Remove attachment
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => isValidAttachment(file));
    
    if (validFiles.length > 0) {
      setAttachments(prev => [...prev, ...validFiles.slice(0, DEFAULT_MESSAGING_CONFIG.max_attachments_per_message - prev.length)]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!content.trim() && attachments.length === 0) return;
    if (isSubmitting || disabled) return;

    // Extract mentioned user IDs from content (handles @First_Last format with underscores)
    const mentionedUserIds: string[] = [];
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionHandle = match[1]; // This will be "Bob_Dylan" format
      const userId = mentionedUsers.get(mentionHandle);
      if (userId) {
        mentionedUserIds.push(userId);
      }
    }

    const messageData: MessageCompositionData = {
      content: content.trim(),
      thread_id: threadId,
      reply_to_id: replyToMessage?.id,
      attachments,
      mentions: mentionedUserIds,
    };

    const validationResult = validateMessage(messageData);
    if (!validationResult.is_valid) {
      alert(validationResult.errors.join('\n'));
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (editingMessage && onSaveEdit) {
        await onSaveEdit(editingMessage.id, content.trim());
      } else {
        await onSendMessage(messageData);
      }
      
      // Reset form
      setContent('');
      setAttachments([]);
      setValidation(null);
      setMentionedUsers(new Map());
      if (onCancelReply) onCancelReply();
      if (onCancelEdit) onCancelEdit();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error al enviar el mensaje. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }, [content, attachments, threadId, replyToMessage, editingMessage, isSubmitting, disabled, onSendMessage, onSaveEdit, onCancelReply, onCancelEdit, mentionedUsers]);

  // Update textarea height when content changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [content, adjustTextareaHeight]);

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (mentionPickerRef.current && !mentionPickerRef.current.contains(event.target as Node)) {
        setShowMentionPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Common emoji reactions
  const quickEmojis = ['😊', '👍', '❤️', '😂', '🎉', '💡', '👏', '🔥'];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-visible">
      {/* Reply/Edit indicator */}
      {(replyToMessage || editingMessage) && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            {replyToMessage && (
              <>
                <Reply className="w-4 h-4" />
                <span>Respondiendo a <strong>{replyToMessage.author_name}</strong></span>
                <span className="text-gray-400 truncate max-w-xs">
                  {replyToMessage.content.substring(0, 50)}...
                </span>
              </>
            )}
            {editingMessage && (
              <>
                <FileText className="w-4 h-4" />
                <span>Editando mensaje</span>
              </>
            )}
          </div>
          <button
            onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main composer area */}
      <div
        className="relative overflow-visible"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled || isSubmitting}
          maxLength={maxLength}
          className="w-full p-4 pr-20 border-0 resize-none focus:outline-none focus:ring-0 placeholder-gray-400"
          style={{ minHeight: '80px', maxHeight: '200px' }}
        />

        {/* Character count */}
        <div className="absolute bottom-2 right-16 text-xs text-gray-400">
          {content.length}/{maxLength}
        </div>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={(!content.trim() && attachments.length === 0) || isSubmitting || disabled}
          className="absolute bottom-3 right-3 w-8 h-8 bg-[#fdb933] text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f5b927] transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>

        {/* Mention picker */}
        {showMentionPicker && mentionSuggestions.length > 0 && (
          <div
            ref={mentionPickerRef}
            className="absolute left-4 top-0 z-[100] w-80 bg-white rounded-lg shadow-xl border border-gray-200"
            style={{ transform: 'translateY(-100%) translateY(-8px)' }}
          >
            <MentionPicker
              isVisible={showMentionPicker}
              query={mentionQuery}
              suggestions={mentionSuggestions}
              selectedIndex={selectedMentionIndex}
              onSelect={insertMention}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSelectedMentionIndex(prev => Math.min(prev + 1, mentionSuggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedMentionIndex(prev => Math.max(prev - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (mentionSuggestions[selectedMentionIndex]) {
                    insertMention(mentionSuggestions[selectedMentionIndex]);
                  }
                } else if (e.key === 'Escape') {
                  setShowMentionPicker(false);
                }
              }}
              onClose={() => setShowMentionPicker(false)}
            />
          </div>
        )}
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 space-y-2">
          {attachments.map((file, index) => (
            <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
              <div className="flex items-center space-x-2">
                {file.type.startsWith('image/') ? (
                  <Image className="w-4 h-4 text-blue-500" />
                ) : (
                  <FileText className="w-4 h-4 text-gray-500" />
                )}
                <span className="text-sm text-gray-700 truncate max-w-xs">{file.name}</span>
                <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
              </div>
              <button
                onClick={() => removeAttachment(index)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Validation errors */}
      {validation && !validation.is_valid && (
        <div className="px-4 py-2 border-t border-red-200 bg-red-50">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <div className="text-sm">
              {validation.errors.map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Attachment button */}
          {allowAttachments && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isSubmitting}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                title="Adjuntar archivo"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept={DEFAULT_MESSAGING_CONFIG.allowed_attachment_types.join(',')}
              />
            </>
          )}

          {/* Emoji button */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={disabled || isSubmitting}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              title="Agregar emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            
            {/* Quick emoji picker */}
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex space-x-1 z-10"
              >
                {quickEmojis.map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setContent(prev => prev + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mention button */}
          {allowMentions && (
            <button
              onClick={() => {
                if (textareaRef.current) {
                  const cursorPosition = textareaRef.current.selectionStart;
                  const newContent = content.slice(0, cursorPosition) + '@' + content.slice(cursorPosition);
                  setContent(newContent);
                  textareaRef.current.focus();
                  setTimeout(() => {
                    textareaRef.current?.setSelectionRange(cursorPosition + 1, cursorPosition + 1);
                  }, 0);
                }
              }}
              disabled={disabled || isSubmitting}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              title="Mencionar usuario"
            >
              <AtSign className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          {(replyToMessage || editingMessage) && (
            <button
              onClick={editingMessage ? onCancelEdit : onCancelReply}
              disabled={isSubmitting}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={(!content.trim() && attachments.length === 0) || isSubmitting || disabled}
            className="bg-[#fdb933] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f5b927] transition-colors"
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Enviando...</span>
              </div>
            ) : editingMessage ? (
              'Guardar cambios'
            ) : (
              'Enviar mensaje'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageComposer;