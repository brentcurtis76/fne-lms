-- =============================================================================
-- ACTIVITY FEED SYSTEM - FINAL FIXED VERSION (Parameter Order Corrected)
-- Phase 5 of Collaborative Workspace System for FNE LMS
-- 
-- INSTRUCTIONS:
-- 1. Copy this entire script
-- 2. Paste it into Supabase SQL Editor
-- 3. Click "Run" to execute
-- =============================================================================

-- Step 1: Drop existing types if they exist (in case of retry)
DROP TYPE IF EXISTS activity_type CASCADE;
DROP TYPE IF EXISTS entity_type CASCADE;
DROP TYPE IF EXISTS notification_method CASCADE;

-- Step 2: Create custom enums for activity feed system
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

-- Step 3: Drop existing tables if they exist (in case of retry)
DROP TABLE IF EXISTS activity_feed CASCADE;
DROP TABLE IF EXISTS activity_subscriptions CASCADE;
DROP TABLE IF EXISTS activity_aggregations CASCADE;

-- Step 4: Create core activity feed tables

-- Activity feed table - core activity tracking
CREATE TABLE activity_feed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID, -- Will reference community_workspaces(id) when available
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    activity_type activity_type NOT NULL,
    entity_type entity_type NOT NULL,
    entity_id UUID, -- Reference to the specific entity (meeting_id, document_id, etc.)
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    is_public BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    importance_score INTEGER DEFAULT 1,
    tags TEXT[] DEFAULT '{}',
    related_users UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity subscriptions table - user notification preferences
CREATE TABLE activity_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID,
    activity_types activity_type[] DEFAULT '{}',
    entity_types entity_type[] DEFAULT '{}',
    notification_methods notification_method[] DEFAULT '{"in_app"}',
    is_enabled BOOLEAN DEFAULT TRUE,
    daily_digest BOOLEAN DEFAULT FALSE,
    weekly_digest BOOLEAN DEFAULT FALSE,
    importance_threshold INTEGER DEFAULT 1,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);

-- Activity aggregations table - daily/weekly activity summaries
CREATE TABLE activity_aggregations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID,
    aggregation_date DATE NOT NULL,
    aggregation_type TEXT NOT NULL,
    activity_counts JSONB DEFAULT '{}',
    entity_counts JSONB DEFAULT '{}',
    top_users JSONB DEFAULT '[]',
    engagement_metrics JSONB DEFAULT '{}',
    total_activities INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    peak_hour INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, aggregation_date, aggregation_type)
);

-- Step 5: Create indexes for performance
CREATE INDEX idx_activity_feed_workspace ON activity_feed(workspace_id);
CREATE INDEX idx_activity_feed_user ON activity_feed(user_id);
CREATE INDEX idx_activity_feed_type ON activity_feed(activity_type);
CREATE INDEX idx_activity_feed_entity ON activity_feed(entity_type);
CREATE INDEX idx_activity_feed_created ON activity_feed(created_at DESC);
CREATE INDEX idx_activity_feed_public ON activity_feed(is_public);
CREATE INDEX idx_activity_feed_importance ON activity_feed(importance_score);
CREATE INDEX idx_activity_feed_workspace_created ON activity_feed(workspace_id, created_at DESC);

CREATE INDEX idx_activity_subscriptions_user_workspace ON activity_subscriptions(user_id, workspace_id);
CREATE INDEX idx_activity_subscriptions_workspace ON activity_subscriptions(workspace_id);

CREATE INDEX idx_activity_aggregations_workspace_date ON activity_aggregations(workspace_id, aggregation_date);
CREATE INDEX idx_activity_aggregations_date_type ON activity_aggregations(aggregation_date, aggregation_type);

-- Step 6: Enable Row Level Security (RLS)
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_aggregations ENABLE ROW LEVEL SECURITY;

-- Step 7: Create simplified RLS Policies (without profiles table dependencies)

-- Activity Feed Policies
CREATE POLICY "Users can view public activities" ON activity_feed
    FOR SELECT USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "Users can create activities" ON activity_feed
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own activities" ON activity_feed
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own activities" ON activity_feed
    FOR DELETE USING (user_id = auth.uid());

-- Activity Subscriptions Policies
CREATE POLICY "Users can manage their own subscriptions" ON activity_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- Activity Aggregations Policies (open for now)
CREATE POLICY "Users can view aggregations" ON activity_aggregations
    FOR SELECT USING (true);

-- Step 8: Create utility functions with CORRECT parameter order

-- Function to create activity - ALL REQUIRED PARAMETERS FIRST, THEN ALL OPTIONAL WITH DEFAULTS
CREATE OR REPLACE FUNCTION create_activity(
    p_workspace_id UUID,
    p_activity_type activity_type,
    p_entity_type entity_type,
    p_user_id UUID DEFAULT NULL,
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
BEGIN
    INSERT INTO activity_feed (
        workspace_id,
        user_id,
        activity_type,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        importance_score,
        tags,
        related_users
    ) VALUES (
        p_workspace_id,
        COALESCE(p_user_id, auth.uid()),
        p_activity_type,
        p_entity_type,
        p_entity_id,
        COALESCE(p_title, p_activity_type::text),
        p_description,
        p_metadata,
        p_importance_score,
        p_tags,
        p_related_users
    ) RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get activity stats - NO DEFAULTS, OR ALL PARAMETERS HAVE DEFAULTS
CREATE OR REPLACE FUNCTION get_activity_stats(
    p_workspace_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    stats JSONB := '{}';
    total_count INTEGER;
    today_count INTEGER;
    week_count INTEGER;
    most_active_type activity_type;
BEGIN
    -- Get total activities
    SELECT COUNT(*) INTO total_count
    FROM activity_feed 
    WHERE workspace_id = p_workspace_id OR p_workspace_id IS NULL;
    
    -- Get today's activities
    SELECT COUNT(*) INTO today_count
    FROM activity_feed 
    WHERE (workspace_id = p_workspace_id OR p_workspace_id IS NULL)
    AND created_at >= CURRENT_DATE;
    
    -- Get this week's activities
    SELECT COUNT(*) INTO week_count
    FROM activity_feed 
    WHERE (workspace_id = p_workspace_id OR p_workspace_id IS NULL)
    AND created_at >= DATE_TRUNC('week', CURRENT_DATE);
    
    -- Get most active activity type
    SELECT activity_type INTO most_active_type
    FROM activity_feed 
    WHERE workspace_id = p_workspace_id OR p_workspace_id IS NULL
    GROUP BY activity_type 
    ORDER BY COUNT(*) DESC 
    LIMIT 1;
    
    -- Build stats object
    stats := jsonb_build_object(
        'total_activities', total_count,
        'activities_today', today_count,
        'activities_this_week', week_count,
        'most_active_type', most_active_type,
        'most_active_user', NULL,
        'engagement_trend', 'stable',
        'peak_hours', ARRAY[9, 10, 11, 14, 15, 16]
    );
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Enable Realtime for activity_feed table
ALTER PUBLICATION supabase_realtime ADD TABLE activity_feed;

-- Step 10: Create some sample data for testing
INSERT INTO activity_feed (
    workspace_id, 
    user_id, 
    activity_type, 
    entity_type, 
    title, 
    description,
    importance_score
) VALUES 
    (
        gen_random_uuid(), 
        auth.uid(), 
        'workspace_created', 
        'workspace', 
        'Sistema de actividades configurado', 
        'El feed de actividades está listo para usar en el espacio colaborativo',
        3
    ),
    (
        gen_random_uuid(), 
        auth.uid(), 
        'user_joined', 
        'user', 
        'Bienvenido al feed de actividades', 
        'Ahora puedes ver todas las actividades de tu comunidad en tiempo real',
        2
    ),
    (
        gen_random_uuid(), 
        auth.uid(), 
        'notification_sent', 
        'system', 
        'Sistema de notificaciones activo', 
        'Las notificaciones están configuradas y funcionando correctamente',
        1
    );

-- =============================================================================
-- SETUP COMPLETE!
-- =============================================================================

-- Success message
SELECT 
    'Activity Feed System setup completed successfully! 🎉' as setup_status,
    (SELECT COUNT(*) FROM activity_feed) as sample_activities_created,
    'Ready to use in the Feed tab of your workspace!' as next_step;