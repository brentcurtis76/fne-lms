/**
 * Messaging System Type Definitions
 * Phase 4 of Collaborative Workspace System for FNE LMS
 * Following established patterns from types/documents.ts
 */

// =============================================================================
// ENUMS AND CONSTANTS
// =============================================================================

export type MessageType = 'regular' | 'system' | 'announcement';
export type ThreadCategory = 'general' | 'resources' | 'announcements' | 'questions' | 'projects';
export type MentionType = 'user' | 'all' | 'role';
export type ReactionType = 'thumbs_up' | 'heart' | 'lightbulb' | 'celebration' | 'eyes' | 'question';
export type MessageActivityType = 'message_sent' | 'message_edited' | 'message_deleted' | 'thread_created' | 'reaction_added' | 'mention_created' | 'attachment_uploaded';

// Reaction display configuration
export interface ReactionConfig {
  type: ReactionType;
  emoji: string;
  label: string;
  color: string;
}

export const REACTION_TYPES: ReactionConfig[] = [
  { type: 'thumbs_up', emoji: '👍', label: 'Me gusta', color: '#3b82f6' },
  { type: 'heart', emoji: '❤️', label: 'Me encanta', color: '#ef4444' },
  { type: 'lightbulb', emoji: '💡', label: 'Buena idea', color: '#f59e0b' },
  { type: 'celebration', emoji: '🎉', label: 'Excelente', color: '#10b981' },
  { type: 'eyes', emoji: '👀', label: 'Interesante', color: '#6366f1' },
  { type: 'question', emoji: '❓', label: 'Tengo dudas', color: '#8b5cf6' },
];

// Thread category configuration
export interface ThreadCategoryConfig {
  type: ThreadCategory;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const THREAD_CATEGORIES: ThreadCategoryConfig[] = [
  { type: 'general', label: 'General', icon: 'MessageCircle', color: '#6b7280', description: 'Conversaciones generales' },
  { type: 'resources', label: 'Recursos', icon: 'BookOpen', color: '#3b82f6', description: 'Compartir recursos y materiales' },
  { type: 'announcements', label: 'Anuncios', icon: 'Megaphone', color: '#f59e0b', description: 'Anuncios importantes' },
  { type: 'questions', label: 'Preguntas', icon: 'HelpCircle', color: '#8b5cf6', description: 'Preguntas y respuestas' },
  { type: 'projects', label: 'Proyectos', icon: 'Briefcase', color: '#10b981', description: 'Colaboración en proyectos' },
];

// =============================================================================
// CORE INTERFACES
// =============================================================================

// Message thread interface
export interface MessageThread {
  id: string;
  workspace_id: string;
  thread_title: string;
  description?: string;
  category: ThreadCategory;
  created_by: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_archived: boolean;
  last_message_at: string;
  message_count: number;
  participant_count: number;
  created_at: string;
  updated_at: string;
}

// Community message interface
export interface CommunityMessage {
  id: string;
  workspace_id: string;
  thread_id: string;
  reply_to_id?: string;
  author_id: string;
  content: string;
  content_html?: string;
  message_type: MessageType;
  is_edited: boolean;
  is_deleted: boolean;
  edited_at?: string;
  created_at: string;
  updated_at: string;
}

// Message mention interface
export interface MessageMention {
  id: string;
  message_id: string;
  mentioned_user_id: string;
  mention_type: MentionType;
  mention_text: string;
  is_read: boolean;
  created_at: string;
}

// Message reaction interface
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

// Message attachment interface
export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  thumbnail_path?: string;
  description?: string;
  uploaded_by: string;
  download_count?: number;
  view_count?: number;
  is_active: boolean;
  created_at: string;
}

// Message activity log interface
export interface MessageActivityLog {
  id: string;
  user_id?: string;
  workspace_id: string;
  message_id?: string;
  thread_id?: string;
  action_type: MessageActivityType;
  metadata: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// =============================================================================
// ENHANCED INTERFACES WITH RELATIONSHIPS
// =============================================================================

// Extended message with user info and reactions
export interface MessageWithDetails extends CommunityMessage {
  author_name: string;
  author_email: string;
  author_avatar?: string;
  reply_to_message?: {
    id: string;
    content: string;
    author_name: string;
    created_at: string;
  };
  reactions: MessageReactionSummary[];
  attachments: MessageAttachment[];
  mentions: MessageMention[];
  user_reaction?: ReactionType;
  is_mentioned: boolean;
}

// Extended thread with latest message and participants
export interface ThreadWithDetails extends MessageThread {
  creator_name: string;
  creator_email: string;
  latest_message?: {
    id: string;
    content: string;
    author_name: string;
    created_at: string;
    attachment_count: number;
  };
  participants: ThreadParticipant[];
  unread_count?: number;
  category_config: ThreadCategoryConfig;
}

// Thread participant information
export interface ThreadParticipant {
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar?: string;
  message_count: number;
  last_message_at: string;
  total_reactions_given: number;
  total_mentions: number;
}

// Message reaction summary for display
export interface MessageReactionSummary {
  reaction_type: ReactionType;
  count: number;
  users: Array<{
    user_id: string;
    user_name: string;
  }>;
  user_reacted: boolean;
}

// =============================================================================
// FORM AND INPUT INTERFACES
// =============================================================================

// Thread creation data
export interface ThreadCreationData {
  thread_title: string;
  description?: string;
  category: ThreadCategory;
  initial_message: string;
  workspace_id: string;
}

// Message composition data
export interface MessageCompositionData {
  content: string;
  content_html?: string;
  thread_id: string;
  reply_to_id?: string;
  message_type?: MessageType;
  attachments?: File[];
  mentions?: string[];
}

// Message editing data
export interface MessageEditData {
  content: string;
  content_html?: string;
}

// =============================================================================
// FILTER AND SEARCH INTERFACES
// =============================================================================

// Message search and filter options
export interface MessageFilters {
  search?: string;
  thread_id?: string;
  category?: ThreadCategory;
  mention_filter?: 'all' | 'mentions_only' | 'my_messages';
  attachment_filter?: 'all' | 'with_attachments' | 'no_attachments';
  date_from?: string;
  date_to?: string;
  author_id?: string;
  message_type?: MessageType;
  sort_by?: 'created_at' | 'relevance' | 'thread_activity';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Thread search and filter options
export interface ThreadFilters {
  search?: string;
  category?: ThreadCategory;
  status?: 'all' | 'active' | 'pinned' | 'archived';
  participant_filter?: 'all' | 'participating' | 'not_participating';
  date_from?: string;
  date_to?: string;
  created_by?: string;
  sort_by?: 'last_message_at' | 'created_at' | 'message_count' | 'participant_count' | 'thread_title';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// =============================================================================
// STATISTICS AND ANALYTICS INTERFACES
// =============================================================================

// Messaging statistics for workspace
export interface MessagingStatistics {
  total_threads: number;
  total_messages: number;
  active_participants: number;
  recent_activity: number;
  pinned_threads: number;
  total_attachments: number;
  thread_categories: Record<ThreadCategory, number>;
}

// User messaging activity summary
export interface UserMessagingActivity {
  user_id: string;
  user_name: string;
  user_email: string;
  total_messages: number;
  total_threads_created: number;
  total_reactions_given: number;
  total_reactions_received: number;
  total_mentions: number;
  total_attachments: number;
  last_active: string;
  most_active_category: ThreadCategory;
}

// Thread analytics data
export interface ThreadAnalytics {
  thread_id: string;
  thread_title: string;
  message_count: number;
  participant_count: number;
  total_reactions: number;
  total_attachments: number;
  average_response_time: number; // in minutes
  peak_activity_hour: number;
  engagement_score: number;
  created_at: string;
  last_message_at: string;
}

// =============================================================================
// PERMISSION AND ACCESS INTERFACES
// =============================================================================

// Messaging permissions for user roles
export interface MessagingPermissions {
  can_view_messages: boolean;
  can_send_messages: boolean;
  can_create_threads: boolean;
  can_edit_own_messages: boolean;
  can_delete_own_messages: boolean;
  can_moderate_messages: boolean;
  can_pin_threads: boolean;
  can_archive_threads: boolean;
  can_upload_attachments: boolean;
  can_mention_all: boolean;
  can_view_analytics: boolean;
  can_manage_reactions: boolean;
}

// =============================================================================
// REAL-TIME AND SUBSCRIPTION INTERFACES
// =============================================================================

// Real-time message event
export interface MessageEvent {
  event_type: 'INSERT' | 'UPDATE' | 'DELETE';
  message: MessageWithDetails;
  thread_id: string;
  workspace_id: string;
}

// Real-time thread event
export interface ThreadEvent {
  event_type: 'INSERT' | 'UPDATE' | 'DELETE';
  thread: ThreadWithDetails;
  workspace_id: string;
}

// Real-time reaction event
export interface ReactionEvent {
  event_type: 'INSERT' | 'DELETE';
  reaction: MessageReaction;
  message_id: string;
  thread_id: string;
  workspace_id: string;
}

// Subscription configuration
export interface MessageSubscriptionConfig {
  workspace_id: string;
  thread_id?: string;
  user_id?: string;
  include_mentions?: boolean;
  include_reactions?: boolean;
  include_typing_indicators?: boolean;
}

// =============================================================================
// UI STATE AND COMPONENT INTERFACES
// =============================================================================

// Message composer state
export interface MessageComposerState {
  content: string;
  content_html: string;
  attachments: File[];
  mentions: string[];
  reply_to_message?: MessageWithDetails;
  is_uploading: boolean;
  upload_progress: number;
  is_submitting: boolean;
  show_emoji_picker: boolean;
  show_mention_picker: boolean;
}

// Thread list view state
export interface ThreadListState {
  threads: ThreadWithDetails[];
  filters: ThreadFilters;
  selected_thread_id?: string;
  loading: boolean;
  error?: string;
  has_more: boolean;
  search_results?: ThreadWithDetails[];
}

// Message list view state
export interface MessageListState {
  messages: MessageWithDetails[];
  filters: MessageFilters;
  loading: boolean;
  error?: string;
  has_more: boolean;
  selected_message_id?: string;
  reply_to_message?: MessageWithDetails;
  editing_message_id?: string;
}

// Mention picker state
export interface MentionPickerState {
  query: string;
  suggestions: MentionSuggestion[];
  selected_index: number;
  is_visible: boolean;
  position: { x: number; y: number };
}

// Mention suggestion
export interface MentionSuggestion {
  type: MentionType;
  id: string;
  display_name: string;
  email?: string;
  avatar?: string;
  role?: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

// File upload progress for attachments
export interface AttachmentUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error_message?: string;
  attachment_id?: string;
}

// Message validation result
export interface MessageValidation {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  content_length: number;
  mention_count: number;
  attachment_count: number;
}

// Search result with highlighting
export interface MessageSearchResult {
  message: MessageWithDetails;
  thread: ThreadWithDetails;
  highlighted_content: string;
  relevance_score: number;
  match_type: 'content' | 'attachment' | 'mention';
}

// Export data interfaces
export interface MessageExportData {
  threads: ThreadWithDetails[];
  messages: MessageWithDetails[];
  export_date: string;
  workspace_name: string;
  date_range: {
    from: string;
    to: string;
  };
  filters_applied: MessageFilters;
  total_records: number;
}

// =============================================================================
// CONFIGURATION INTERFACES
// =============================================================================

// Messaging system configuration
export interface MessagingConfig {
  max_message_length: number;
  max_attachment_size: number;
  max_attachments_per_message: number;
  allowed_attachment_types: string[];
  enable_real_time: boolean;
  enable_push_notifications: boolean;
  enable_email_notifications: boolean;
  auto_mark_mentions_read: boolean;
  message_retention_days: number;
  enable_message_editing: boolean;
  enable_message_deletion: boolean;
  enable_thread_locking: boolean;
  enable_reactions: boolean;
  default_thread_category: ThreadCategory;
}

// Default messaging configuration
export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  max_message_length: 10000,
  max_attachment_size: 50 * 1024 * 1024, // 50MB
  max_attachments_per_message: 10,
  allowed_attachment_types: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg'
  ],
  enable_real_time: true,
  enable_push_notifications: true,
  enable_email_notifications: true,
  auto_mark_mentions_read: true,
  message_retention_days: 365,
  enable_message_editing: true,
  enable_message_deletion: true,
  enable_thread_locking: true,
  enable_reactions: true,
  default_thread_category: 'general',
};