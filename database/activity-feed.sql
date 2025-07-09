-- =============================================================================
-- ACTIVITY FEED SYSTEM DATABASE SCHEMA
-- Phase 5 of Collaborative Workspace System for FNE LMS
-- Following established patterns from messaging-system.sql and document-system.sql
-- =============================================================================

-- Create custom enums for activity feed system
CREATE TYPE activity_type AS ENUM (
    -- Meeting activities
    'meeting_created', 'meeting_updated', 'meeting_completed', 'meeting_deleted',
    'agreement_added', 'agreement_updated', 'commitment_made', 'commitment_completed',
    'task_assigned', 'task_completed', 'task_updated', 'attendee_added',
    
    -- Document activities  
    'document_uploaded', 'document_updated', 'document_downloaded', 'document_shared',
    'document_deleted', 'folder_created', 'folder_updated', 'folder_deleted',
    'version_created', 'access_granted', 'access_revoked',
    
    -- Message activities
    'message_sent', 'message_edited', 'message_deleted', 'thread_created',
    'thread_updated', 'reaction_added', 'mention_created', 'attachment_uploaded',
    
    -- User activities
    'user_joined', 'user_left', 'role_changed', 'login_tracked', 'profile_updated',
    
    -- System activities
    'workspace_created', 'workspace_updated', 'settings_changed', 'bulk_operation',
    'notification_sent', 'report_generated', 'backup_created', 'maintenance_performed'
);

CREATE TYPE entity_type AS ENUM (
    'meeting', 'agreement', 'commitment', 'task', 'attendee',
    'document', 'folder', 'version', 'access_permission',
    'message', 'thread', 'reaction', 'mention', 'attachment',
    'user', 'workspace', 'notification', 'report', 'system'
);

CREATE TYPE notification_method AS ENUM ('in_app', 'email', 'push', 'sms');

-- =============================================================================
-- CORE ACTIVITY FEED TABLES
-- =============================================================================

-- Activity feed table - core activity tracking
CREATE TABLE activity_feed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    activity_type activity_type NOT NULL,
    entity_type entity_type NOT NULL,
    entity_id UUID, -- Reference to the specific entity (meeting_id, document_id, etc.)
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}', -- Flexible data storage for activity-specific information
    is_public BOOLEAN DEFAULT TRUE, -- Whether activity is visible to all workspace members
    is_system BOOLEAN DEFAULT FALSE, -- System-generated vs user-generated activity
    importance_score INTEGER DEFAULT 1, -- 1-5 priority scoring for filtering
    tags TEXT[] DEFAULT '{}', -- Activity categorization tags
    related_users UUID[] DEFAULT '{}', -- Other users involved in this activity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity subscriptions table - user notification preferences
CREATE TABLE activity_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    activity_types activity_type[] DEFAULT '{}', -- Subscribed activity types
    entity_types entity_type[] DEFAULT '{}', -- Subscribed entity types
    notification_methods notification_method[] DEFAULT '{"in_app"}', -- Preferred notification methods
    is_enabled BOOLEAN DEFAULT TRUE,
    daily_digest BOOLEAN DEFAULT FALSE, -- Receive daily activity summary
    weekly_digest BOOLEAN DEFAULT FALSE, -- Receive weekly activity summary
    importance_threshold INTEGER DEFAULT 1, -- Only notify for activities >= this importance
    quiet_hours_start TIME, -- No notifications during these hours
    quiet_hours_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);

-- Activity aggregations table - daily/weekly activity summaries for performance
CREATE TABLE activity_aggregations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    aggregation_date DATE NOT NULL,
    aggregation_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
    activity_counts JSONB DEFAULT '{}', -- Count by activity_type
    entity_counts JSONB DEFAULT '{}', -- Count by entity_type
    top_users JSONB DEFAULT '[]', -- Most active users with activity counts
    engagement_metrics JSONB DEFAULT '{}', -- Additional engagement data
    total_activities INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    peak_hour INTEGER, -- Hour with most activity (0-23)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, aggregation_date, aggregation_type)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =============================================================================

-- Activity feed indexes
CREATE INDEX idx_activity_feed_workspace_date ON activity_feed(workspace_id, created_at DESC);
CREATE INDEX idx_activity_feed_user_date ON activity_feed(user_id, created_at DESC);
CREATE INDEX idx_activity_feed_type_date ON activity_feed(activity_type, created_at DESC);
CREATE INDEX idx_activity_feed_entity ON activity_feed(entity_type, entity_id);
CREATE INDEX idx_activity_feed_public_date ON activity_feed(workspace_id, is_public, created_at DESC);
CREATE INDEX idx_activity_feed_importance ON activity_feed(workspace_id, importance_score, created_at DESC);
CREATE INDEX idx_activity_feed_tags ON activity_feed USING GIN(tags);
CREATE INDEX idx_activity_feed_metadata ON activity_feed USING GIN(metadata);
CREATE INDEX idx_activity_feed_related_users ON activity_feed USING GIN(related_users);

-- Subscription indexes
CREATE INDEX idx_activity_subscriptions_user ON activity_subscriptions(user_id);
CREATE INDEX idx_activity_subscriptions_workspace ON activity_subscriptions(workspace_id);
CREATE INDEX idx_activity_subscriptions_enabled ON activity_subscriptions(is_enabled);

-- Aggregation indexes
CREATE INDEX idx_activity_aggregations_workspace_date ON activity_aggregations(workspace_id, aggregation_date DESC);
CREATE INDEX idx_activity_aggregations_type_date ON activity_aggregations(aggregation_type, aggregation_date DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_aggregations ENABLE ROW LEVEL SECURITY;

-- Activity feed policies
CREATE POLICY "Users can view activities in their workspace or assigned communities"
    ON activity_feed FOR SELECT
    USING (
        -- Community members can see public activities
        (is_public = true AND workspace_id IN (
            SELECT cw.id FROM community_workspaces cw
            JOIN user_community_assignments uca ON cw.community_id = uca.community_id
            WHERE uca.user_id = auth.uid()
        ))
        OR
        -- Users can see their own activities
        user_id = auth.uid()
        OR
        -- Admins can see all activities
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role_type = 'admin' AND ur.is_active = true
        )
        OR
        -- Community leaders can see all activities in their communities
        EXISTS (
            SELECT 1 FROM user_community_assignments uca
            JOIN community_workspaces cw ON uca.community_id = cw.community_id
            WHERE uca.user_id = auth.uid() 
            AND uca.role = 'lider_comunidad'
            AND cw.id = workspace_id
        )
        OR
        -- Consultants can see activities in communities where they have assignments
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN user_community_assignments uca ON up.user_id = uca.user_id
            JOIN community_workspaces cw ON uca.community_id = cw.community_id
            WHERE up.user_id = auth.uid()
            AND up.role = 'consultant'
            AND cw.id = workspace_id
        )
    );

CREATE POLICY "Users can create activities in accessible workspaces"
    ON activity_feed FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT cw.id FROM community_workspaces cw
            JOIN user_community_assignments uca ON cw.community_id = uca.community_id
            WHERE uca.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role_type = 'admin' AND ur.is_active = true
        )
    );

CREATE POLICY "Users can update their own activities or admins/leaders can update any"
    ON activity_feed FOR UPDATE
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role_type = 'admin' AND ur.is_active = true
        )
        OR
        EXISTS (
            SELECT 1 FROM user_community_assignments uca
            JOIN community_workspaces cw ON uca.community_id = cw.community_id
            WHERE uca.user_id = auth.uid() 
            AND uca.role = 'lider_comunidad'
            AND cw.id = workspace_id
        )
    );

-- Activity subscriptions policies
CREATE POLICY "Users can manage their own subscriptions"
    ON activity_subscriptions FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all subscriptions"
    ON activity_subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role_type = 'admin' AND ur.is_active = true
        )
    );

-- Activity aggregations policies
CREATE POLICY "Users can view aggregations for their accessible workspaces"
    ON activity_aggregations FOR SELECT
    USING (
        workspace_id IN (
            SELECT cw.id FROM community_workspaces cw
            JOIN user_community_assignments uca ON cw.community_id = uca.community_id
            WHERE uca.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() AND ur.role_type = 'admin' AND ur.is_active = true
        )
    );

CREATE POLICY "Only system can insert/update aggregations"
    ON activity_aggregations FOR ALL
    USING (false);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to create activity with automatic metadata population
CREATE OR REPLACE FUNCTION create_activity(
    p_workspace_id UUID,
    p_user_id UUID,
    p_activity_type activity_type,
    p_entity_type entity_type,
    p_entity_id UUID DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}',
    p_importance_score INTEGER DEFAULT 1,
    p_tags TEXT[] DEFAULT '{}',
    p_related_users UUID[] DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    activity_id UUID;
    auto_title TEXT;
    auto_description TEXT;
BEGIN
    -- Auto-generate title if not provided
    IF p_title IS NULL THEN
        auto_title := CASE p_activity_type
            WHEN 'meeting_created' THEN 'Nueva reunión creada'
            WHEN 'document_uploaded' THEN 'Documento subido'
            WHEN 'message_sent' THEN 'Nuevo mensaje'
            WHEN 'user_joined' THEN 'Usuario se unió al espacio'
            ELSE replace(p_activity_type::TEXT, '_', ' ')
        END;
    ELSE
        auto_title := p_title;
    END IF;

    -- Auto-generate description if not provided
    IF p_description IS NULL THEN
        auto_description := 'Actividad de ' || p_entity_type::TEXT || ' en el espacio colaborativo';
    ELSE
        auto_description := p_description;
    END IF;

    INSERT INTO activity_feed (
        workspace_id, user_id, activity_type, entity_type, entity_id,
        title, description, metadata, importance_score, tags, related_users
    ) VALUES (
        p_workspace_id, p_user_id, p_activity_type, p_entity_type, p_entity_id,
        auto_title, auto_description, p_metadata, p_importance_score, p_tags, p_related_users
    ) RETURNING id INTO activity_id;

    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get activity feed with pagination and filtering
CREATE OR REPLACE FUNCTION get_activity_feed(
    p_workspace_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_activity_types activity_type[] DEFAULT NULL,
    p_entity_types entity_type[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_min_importance INTEGER DEFAULT 1,
    p_include_system BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
    id UUID,
    workspace_id UUID,
    user_id UUID,
    activity_type activity_type,
    entity_type entity_type,
    entity_id UUID,
    title TEXT,
    description TEXT,
    metadata JSONB,
    importance_score INTEGER,
    tags TEXT[],
    related_users UUID[],
    created_at TIMESTAMP WITH TIME ZONE,
    user_name TEXT,
    user_email TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        af.id,
        af.workspace_id,
        af.user_id,
        af.activity_type,
        af.entity_type,
        af.entity_id,
        af.title,
        af.description,
        af.metadata,
        af.importance_score,
        af.tags,
        af.related_users,
        af.created_at,
        COALESCE(up.full_name, u.email) as user_name,
        u.email as user_email
    FROM activity_feed af
    LEFT JOIN auth.users u ON af.user_id = u.id
    LEFT JOIN user_profiles up ON af.user_id = up.user_id
    WHERE af.workspace_id = p_workspace_id
        AND (p_user_id IS NULL OR af.user_id = p_user_id)
        AND (p_activity_types IS NULL OR af.activity_type = ANY(p_activity_types))
        AND (p_entity_types IS NULL OR af.entity_type = ANY(p_entity_types))
        AND af.importance_score >= p_min_importance
        AND (p_include_system = true OR af.is_system = false)
        AND af.is_public = true
    ORDER BY af.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to aggregate daily activities
CREATE OR REPLACE FUNCTION aggregate_daily_activities(p_date DATE DEFAULT CURRENT_DATE) RETURNS VOID AS $$
DECLARE
    workspace_rec RECORD;
    activity_counts JSONB;
    entity_counts JSONB;
    top_users JSONB;
    total_count INTEGER;
    unique_count INTEGER;
    peak_hour INTEGER;
BEGIN
    -- Process each workspace
    FOR workspace_rec IN SELECT id FROM community_workspaces LOOP
        -- Calculate activity counts by type
        SELECT jsonb_object_agg(activity_type, count) INTO activity_counts
        FROM (
            SELECT activity_type, COUNT(*) as count
            FROM activity_feed
            WHERE workspace_id = workspace_rec.id
                AND created_at::DATE = p_date
            GROUP BY activity_type
        ) t;

        -- Calculate entity counts by type
        SELECT jsonb_object_agg(entity_type, count) INTO entity_counts
        FROM (
            SELECT entity_type, COUNT(*) as count
            FROM activity_feed
            WHERE workspace_id = workspace_rec.id
                AND created_at::DATE = p_date
            GROUP BY entity_type
        ) t;

        -- Calculate top users
        SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'count', count, 'name', user_name)) INTO top_users
        FROM (
            SELECT af.user_id, COUNT(*) as count, COALESCE(up.full_name, u.email) as user_name
            FROM activity_feed af
            LEFT JOIN auth.users u ON af.user_id = u.id
            LEFT JOIN user_profiles up ON af.user_id = up.user_id
            WHERE af.workspace_id = workspace_rec.id
                AND af.created_at::DATE = p_date
                AND af.user_id IS NOT NULL
            GROUP BY af.user_id, up.full_name, u.email
            ORDER BY count DESC
            LIMIT 10
        ) t;

        -- Calculate totals
        SELECT COUNT(*), COUNT(DISTINCT user_id) 
        INTO total_count, unique_count
        FROM activity_feed
        WHERE workspace_id = workspace_rec.id
            AND created_at::DATE = p_date;

        -- Calculate peak hour
        SELECT EXTRACT(HOUR FROM created_at)::INTEGER
        INTO peak_hour
        FROM activity_feed
        WHERE workspace_id = workspace_rec.id
            AND created_at::DATE = p_date
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY COUNT(*) DESC
        LIMIT 1;

        -- Insert or update aggregation
        INSERT INTO activity_aggregations (
            workspace_id, aggregation_date, aggregation_type,
            activity_counts, entity_counts, top_users,
            total_activities, unique_users, peak_hour
        ) VALUES (
            workspace_rec.id, p_date, 'daily',
            COALESCE(activity_counts, '{}'), COALESCE(entity_counts, '{}'), COALESCE(top_users, '[]'),
            total_count, unique_count, peak_hour
        ) ON CONFLICT (workspace_id, aggregation_date, aggregation_type)
        DO UPDATE SET
            activity_counts = EXCLUDED.activity_counts,
            entity_counts = EXCLUDED.entity_counts,
            top_users = EXCLUDED.top_users,
            total_activities = EXCLUDED.total_activities,
            unique_users = EXCLUDED.unique_users,
            peak_hour = EXCLUDED.peak_hour,
            created_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC ACTIVITY LOGGING
-- =============================================================================

-- Function to log meeting activities
CREATE OR REPLACE FUNCTION log_meeting_activity() RETURNS TRIGGER AS $$
DECLARE
    workspace_id UUID;
    activity_title TEXT;
    activity_description TEXT;
BEGIN
    -- Get workspace_id
    SELECT cw.id INTO workspace_id
    FROM community_workspaces cw
    WHERE cw.community_id = NEW.community_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM create_activity(
            workspace_id,
            NEW.created_by,
            'meeting_created',
            'meeting',
            NEW.id,
            'Nueva reunión: ' || NEW.title,
            'Reunión creada para el ' || NEW.meeting_date::TEXT,
            jsonb_build_object('meeting_type', NEW.meeting_type),
            3
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'completed' THEN
        PERFORM create_activity(
            workspace_id,
            NEW.updated_by,
            'meeting_completed',
            'meeting',
            NEW.id,
            'Reunión completada: ' || NEW.title,
            'La reunión ha sido marcada como completada',
            jsonb_build_object('duration_minutes', NEW.duration_minutes),
            2
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log document activities
CREATE OR REPLACE FUNCTION log_document_activity() RETURNS TRIGGER AS $$
DECLARE
    workspace_id UUID;
BEGIN
    -- Get workspace_id
    SELECT id INTO workspace_id FROM community_workspaces WHERE id = NEW.workspace_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM create_activity(
            workspace_id,
            NEW.uploaded_by,
            'document_uploaded',
            'document',
            NEW.id,
            'Documento subido: ' || NEW.file_name,
            'Nuevo documento disponible en el repositorio',
            jsonb_build_object('file_type', NEW.file_type, 'file_size', NEW.file_size),
            2,
            NEW.tags
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log message activities
CREATE OR REPLACE FUNCTION log_message_activity() RETURNS TRIGGER AS $$
DECLARE
    thread_title TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Get thread title for context
        SELECT mt.thread_title INTO thread_title
        FROM message_threads mt
        WHERE mt.id = NEW.thread_id;

        PERFORM create_activity(
            NEW.workspace_id,
            NEW.author_id,
            'message_sent',
            'message',
            NEW.id,
            'Nuevo mensaje en: ' || COALESCE(thread_title, 'Conversación'),
            left(NEW.content, 100) || CASE WHEN length(NEW.content) > 100 THEN '...' ELSE '' END,
            jsonb_build_object('thread_id', NEW.thread_id, 'message_type', NEW.message_type),
            1
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER trigger_log_meeting_activity
    AFTER INSERT OR UPDATE ON community_meetings
    FOR EACH ROW EXECUTE FUNCTION log_meeting_activity();

CREATE TRIGGER trigger_log_document_activity
    AFTER INSERT ON community_documents
    FOR EACH ROW EXECUTE FUNCTION log_document_activity();

CREATE TRIGGER trigger_log_message_activity
    AFTER INSERT ON community_messages
    FOR EACH ROW EXECUTE FUNCTION log_message_activity();

-- =============================================================================
-- UTILITY FUNCTIONS FOR CLEANUP AND MAINTENANCE
-- =============================================================================

-- Function to clean old activities (keep last 6 months)
CREATE OR REPLACE FUNCTION cleanup_old_activities() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_feed
    WHERE created_at < NOW() - INTERVAL '6 months'
        AND importance_score <= 2;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update activity feed counters
CREATE OR REPLACE FUNCTION update_activity_counters() RETURNS VOID AS $$
BEGIN
    -- Update workspace activity counters in community_workspaces
    UPDATE community_workspaces SET
        updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT workspace_id 
        FROM activity_feed 
        WHERE created_at > NOW() - INTERVAL '1 hour'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- INITIAL DATA AND SETUP
-- =============================================================================

-- Create default subscription preferences for existing users
INSERT INTO activity_subscriptions (user_id, workspace_id, activity_types, notification_methods)
SELECT DISTINCT uca.user_id, cw.id, 
    ARRAY['meeting_created', 'document_uploaded', 'message_sent']::activity_type[],
    ARRAY['in_app']::notification_method[]
FROM user_community_assignments uca
JOIN community_workspaces cw ON uca.community_id = cw.community_id
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- =============================================================================
-- COMMENTS AND DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE activity_feed IS 'Core activity tracking for all workspace interactions';
COMMENT ON TABLE activity_subscriptions IS 'User notification preferences for activity types';
COMMENT ON TABLE activity_aggregations IS 'Pre-computed activity summaries for performance';

COMMENT ON COLUMN activity_feed.metadata IS 'Flexible JSONB storage for activity-specific data';
COMMENT ON COLUMN activity_feed.importance_score IS 'Priority score 1-5 for filtering and notifications';
COMMENT ON COLUMN activity_feed.related_users IS 'Array of user IDs involved in this activity';

COMMENT ON FUNCTION create_activity IS 'Helper function to create activities with auto-generated content';
COMMENT ON FUNCTION get_activity_feed IS 'Paginated activity feed with filtering and user context';
COMMENT ON FUNCTION aggregate_daily_activities IS 'Daily aggregation function for performance optimization';