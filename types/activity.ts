/**
 * Activity Feed System Types
 * Phase 5 of Collaborative Workspace System for Genera
 * Following established patterns from messaging.ts and documents.ts
 */

// =============================================================================
// CORE ACTIVITY TYPES
// =============================================================================

export type ActivityType = 
    // Meeting activities
    | 'meeting_created' | 'meeting_updated' | 'meeting_completed' | 'meeting_deleted'
    | 'agreement_added' | 'agreement_updated' | 'commitment_made' | 'commitment_completed'
    | 'task_assigned' | 'task_completed' | 'task_updated' | 'attendee_added'
    
    // Document activities  
    | 'document_uploaded' | 'document_updated' | 'document_downloaded' | 'document_shared'
    | 'document_deleted' | 'folder_created' | 'folder_updated' | 'folder_deleted'
    | 'version_created' | 'access_granted' | 'access_revoked'
    
    // Message activities
    | 'message_sent' | 'message_edited' | 'message_deleted' | 'thread_created'
    | 'thread_updated' | 'reaction_added' | 'mention_created' | 'attachment_uploaded'
    
    // User activities
    | 'user_joined' | 'user_left' | 'role_changed' | 'login_tracked' | 'profile_updated'
    
    // System activities
    | 'workspace_created' | 'workspace_updated' | 'settings_changed' | 'bulk_operation'
    | 'notification_sent' | 'report_generated' | 'backup_created' | 'maintenance_performed';

export type EntityType = 
    | 'meeting' | 'agreement' | 'commitment' | 'task' | 'attendee'
    | 'document' | 'folder' | 'version' | 'access_permission'
    | 'message' | 'thread' | 'reaction' | 'mention' | 'attachment'
    | 'user' | 'workspace' | 'notification' | 'report' | 'system';

export type NotificationMethod = 'in_app' | 'email' | 'push' | 'sms';

// =============================================================================
// DATABASE INTERFACE TYPES
// =============================================================================

export interface ActivityFeed {
    id: string;
    workspace_id: string;
    user_id: string | null;
    activity_type: ActivityType;
    entity_type: EntityType;
    entity_id: string | null;
    title: string;
    description: string | null;
    metadata: Record<string, any>;
    is_public: boolean;
    is_system: boolean;
    importance_score: number;
    tags: string[];
    related_users: string[];
    created_at: string;
    updated_at: string;
}

export interface ActivitySubscription {
    id: string;
    user_id: string;
    workspace_id: string;
    activity_types: ActivityType[];
    entity_types: EntityType[];
    notification_methods: NotificationMethod[];
    is_enabled: boolean;
    daily_digest: boolean;
    weekly_digest: boolean;
    importance_threshold: number;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    created_at: string;
    updated_at: string;
}

export interface ActivityAggregation {
    id: string;
    workspace_id: string;
    aggregation_date: string;
    aggregation_type: string;
    activity_counts: Record<ActivityType, number>;
    entity_counts: Record<EntityType, number>;
    top_users: TopUser[];
    engagement_metrics: Record<string, any>;
    total_activities: number;
    unique_users: number;
    peak_hour: number | null;
    created_at: string;
}

// =============================================================================
// ENHANCED INTERFACE TYPES WITH USER CONTEXT
// =============================================================================

export interface ActivityWithDetails extends ActivityFeed {
    user_name: string | null;
    user_email: string | null;
    user_avatar: string | null;
    user_role: string | null;
    time_ago: string;
    is_recent: boolean;
    can_edit: boolean;
    can_delete: boolean;
    entity_url: string | null;
    activity_icon: string;
    activity_color: string;
}

export interface ActivityGrouped {
    date: string;
    date_formatted: string;
    activities: ActivityWithDetails[];
    total_count: number;
    unique_users: number;
    most_active_user: {
        name: string;
        count: number;
    } | null;
}

export interface TopUser {
    user_id: string;
    count: number;
    name: string;
    email?: string;
    avatar?: string;
    role?: string;
}

// =============================================================================
// FILTER AND SEARCH TYPES
// =============================================================================

export interface ActivityFilters {
    activity_types: ActivityType[];
    entity_types: EntityType[];
    users: string[];
    date_range: {
        start: string | null;
        end: string | null;
    };
    importance_levels: number[];
    include_system: boolean;
    search_query: string;
    view_mode: 'all' | 'personal' | 'following';
}

export interface ActivitySearchOptions {
    query: string;
    filters: Partial<ActivityFilters>;
    sort_by: 'date' | 'importance' | 'relevance';
    sort_order: 'asc' | 'desc';
    limit: number;
    offset: number;
}

export interface ActivityStats {
    total_activities: number;
    activities_today: number;
    activities_this_week: number;
    most_active_type: ActivityType | null;
    most_active_user: TopUser | null;
    engagement_trend: 'up' | 'down' | 'stable';
    peak_hours: number[];
}

// =============================================================================
// COMPONENT PROP TYPES
// =============================================================================

export interface ActivityFeedProps {
    workspaceId: string;
    userId?: string | null;
    filters?: Partial<ActivityFilters>;
    realTimeEnabled?: boolean;
    showGrouping?: boolean;
    showFilters?: boolean;
    showStats?: boolean;
    pageSize?: number;
    className?: string;
}

export interface ActivityCardProps {
    activity: ActivityWithDetails;
    showActions?: boolean;
    showUserInfo?: boolean;
    showTimestamp?: boolean;
    compact?: boolean;
    onClick?: (activity: ActivityWithDetails) => void;
    onUserClick?: (userId: string) => void;
    onEntityClick?: (entityType: EntityType, entityId: string) => void;
}

export interface ActivityFiltersProps {
    filters: ActivityFilters;
    onFiltersChange: (filters: ActivityFilters) => void;
    availableUsers: Array<{
        id: string;
        name: string;
        email: string;
        role: string;
    }>;
    stats: ActivityStats;
    showAdvanced?: boolean;
    className?: string;
}

export interface ActivitySummaryProps {
    workspaceId: string;
    period: 'today' | 'week' | 'month';
    showComparison?: boolean;
    showTrends?: boolean;
    className?: string;
}

export interface ActivityNotificationsProps {
    subscription: ActivitySubscription;
    onSubscriptionUpdate: (subscription: Partial<ActivitySubscription>) => void;
    availableTypes: ActivityType[];
    availableEntities: EntityType[];
    isOpen: boolean;
    onClose: () => void;
}

export interface QuickActionsProps {
    activity: ActivityWithDetails;
    onActionClick: (action: string, activity: ActivityWithDetails) => void;
    availableActions: ActivityAction[];
}

// =============================================================================
// ACTION AND PERMISSION TYPES
// =============================================================================

export interface ActivityAction {
    id: string;
    label: string;
    icon: string;
    color?: string;
    requires_permission?: string;
    entity_types?: EntityType[];
    activity_types?: ActivityType[];
}

export interface ActivityPermissions {
    can_view_all: boolean;
    can_create: boolean;
    can_edit_own: boolean;
    can_edit_any: boolean;
    can_delete_own: boolean;
    can_delete_any: boolean;
    can_manage_subscriptions: boolean;
    can_view_analytics: boolean;
    can_export: boolean;
    max_importance_create: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ActivityFeedResponse {
    activities: ActivityWithDetails[];
    total_count: number;
    has_more: boolean;
    next_offset: number;
    stats: ActivityStats;
    aggregations?: ActivityAggregation[];
}

export interface ActivityCreateRequest {
    workspace_id: string;
    user_id?: string;
    activity_type: ActivityType;
    entity_type: EntityType;
    entity_id?: string;
    title?: string;
    description?: string;
    metadata?: Record<string, any>;
    importance_score?: number;
    tags?: string[];
    related_users?: string[];
}

export interface ActivityUpdateRequest {
    title?: string;
    description?: string;
    metadata?: Record<string, any>;
    importance_score?: number;
    tags?: string[];
    related_users?: string[];
}

export interface SubscriptionUpdateRequest {
    activity_types?: ActivityType[];
    entity_types?: EntityType[];
    notification_methods?: NotificationMethod[];
    is_enabled?: boolean;
    daily_digest?: boolean;
    weekly_digest?: boolean;
    importance_threshold?: number;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
}

// =============================================================================
// REAL-TIME TYPES
// =============================================================================

export interface ActivityRealtimePayload {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: ActivityFeed | null;
    old: ActivityFeed | null;
    errors: any[] | null;
}

export interface ActivityRealtimeSubscription {
    workspace_id: string;
    user_id: string | null;
    filters: Partial<ActivityFilters>;
    callback: (payload: ActivityRealtimePayload) => void;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export interface ActivityTypeConfig {
    label: string;
    icon: string;
    color: string;
    category: 'meeting' | 'document' | 'message' | 'user' | 'system';
    default_importance: number;
    generates_notification: boolean;
    entity_types: EntityType[];
}

export interface ActivityExportOptions {
    format: 'csv' | 'excel' | 'pdf';
    date_range: {
        start: string;
        end: string;
    };
    filters: Partial<ActivityFilters>;
    include_metadata: boolean;
    include_user_details: boolean;
    group_by: 'date' | 'type' | 'user' | 'entity';
}

export interface ActivityImportance {
    score: number;
    label: string;
    description: string;
    color: string;
    notification_default: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const ACTIVITY_TYPE_CONFIG: Partial<Record<ActivityType, ActivityTypeConfig>> = {
    // Meeting activities
    meeting_created: {
        label: 'Reunión creada',
        icon: '📅',
        color: '#0a0a0a',
        category: 'meeting',
        default_importance: 3,
        generates_notification: true,
        entity_types: ['meeting']
    },
    meeting_completed: {
        label: 'Reunión completada',
        icon: '✅',
        color: '#0db14b',
        category: 'meeting',
        default_importance: 2,
        generates_notification: true,
        entity_types: ['meeting']
    },
    task_assigned: {
        label: 'Tarea asignada',
        icon: '📋',
        color: '#fbbf24',
        category: 'meeting',
        default_importance: 3,
        generates_notification: true,
        entity_types: ['task']
    },
    
    // Document activities
    document_uploaded: {
        label: 'Documento subido',
        icon: '📄',
        color: '#0a0a0a',
        category: 'document',
        default_importance: 2,
        generates_notification: true,
        entity_types: ['document']
    },
    folder_created: {
        label: 'Carpeta creada',
        icon: '📁',
        color: '#fbbf24',
        category: 'document',
        default_importance: 1,
        generates_notification: false,
        entity_types: ['folder']
    },
    
    // Message activities
    message_sent: {
        label: 'Mensaje enviado',
        icon: '💬',
        color: '#0a0a0a',
        category: 'message',
        default_importance: 1,
        generates_notification: true,
        entity_types: ['message']
    },
    thread_created: {
        label: 'Hilo creado',
        icon: '🧵',
        color: '#fbbf24',
        category: 'message',
        default_importance: 2,
        generates_notification: true,
        entity_types: ['thread']
    },
    
    // User activities
    user_joined: {
        label: 'Usuario se unió',
        icon: '👋',
        color: '#0db14b',
        category: 'user',
        default_importance: 2,
        generates_notification: true,
        entity_types: ['user']
    },
    
    // System activities
    workspace_created: {
        label: 'Espacio creado',
        icon: '🏗️',
        color: '#0a0a0a',
        category: 'system',
        default_importance: 3,
        generates_notification: false,
        entity_types: ['workspace']
    }
    // ... Add all other activity types as needed
} as const;

export const IMPORTANCE_LEVELS: ActivityImportance[] = [
    {
        score: 1,
        label: 'Baja',
        description: 'Actividad rutinaria',
        color: '#a19c9b',
        notification_default: false
    },
    {
        score: 2,
        label: 'Media',
        description: 'Actividad importante',
        color: '#fbbf24',
        notification_default: true
    },
    {
        score: 3,
        label: 'Alta',
        description: 'Actividad crítica',
        color: '#ef4044',
        notification_default: true
    },
    {
        score: 4,
        label: 'Urgente',
        description: 'Requiere atención inmediata',
        color: '#ae1b1f',
        notification_default: true
    },
    {
        score: 5,
        label: 'Crítica',
        description: 'Máxima prioridad',
        color: '#744943',
        notification_default: true
    }
];

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
    activity_types: [],
    entity_types: [],
    users: [],
    date_range: {
        start: null,
        end: null
    },
    importance_levels: [1, 2, 3, 4, 5],
    include_system: false,
    search_query: '',
    view_mode: 'all'
};

export const ACTIVITY_ACTIONS: ActivityAction[] = [
    {
        id: 'view',
        label: 'Ver detalles',
        icon: '👁️',
        entity_types: ['meeting', 'document', 'message', 'task']
    },
    {
        id: 'edit',
        label: 'Editar',
        icon: '✏️',
        requires_permission: 'can_edit',
        entity_types: ['meeting', 'document', 'message']
    },
    {
        id: 'reply',
        label: 'Responder',
        icon: '💬',
        entity_types: ['message', 'thread']
    },
    {
        id: 'download',
        label: 'Descargar',
        icon: '⬇️',
        entity_types: ['document']
    },
    {
        id: 'share',
        label: 'Compartir',
        icon: '🔗',
        entity_types: ['document', 'meeting']
    },
    {
        id: 'bookmark',
        label: 'Marcar',
        icon: '⭐',
        entity_types: ['meeting', 'document', 'message']
    }
];