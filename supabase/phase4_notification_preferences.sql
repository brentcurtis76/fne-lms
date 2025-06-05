-- FNE LMS Phase 4: User Notification Preferences & Settings
-- Enhanced database schema for comprehensive notification control

-- ============================================================================
-- 1. ENHANCE USER NOTIFICATION PREFERENCES TABLE
-- ============================================================================

-- Add new columns to existing user_notification_preferences table
ALTER TABLE user_notification_preferences 
ADD COLUMN IF NOT EXISTS email_frequency VARCHAR(20) DEFAULT 'immediate' CHECK (email_frequency IN ('immediate', 'daily', 'weekly', 'never')),
ADD COLUMN IF NOT EXISTS quiet_hours_start TIME DEFAULT '22:00:00',
ADD COLUMN IF NOT EXISTS quiet_hours_end TIME DEFAULT '07:00:00',
ADD COLUMN IF NOT EXISTS weekend_quiet BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS priority_override BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_group BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS max_per_hour INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS do_not_disturb BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mobile_optimization BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add trigger to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_notification_preferences_updated_at ON user_notification_preferences;
CREATE TRIGGER update_user_notification_preferences_updated_at BEFORE UPDATE ON user_notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. EMAIL DIGEST QUEUE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    notification_ids UUID[], -- Array of notification IDs to include
    digest_type VARCHAR(20) NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    -- Indexes for performance
    UNIQUE(user_id, digest_type, scheduled_for)
);

CREATE INDEX idx_email_digest_queue_scheduled ON email_digest_queue(scheduled_for) WHERE sent_at IS NULL;
CREATE INDEX idx_email_digest_queue_user_type ON email_digest_queue(user_id, digest_type);

-- ============================================================================
-- 3. NOTIFICATION PREFERENCE HISTORY (FOR ANALYTICS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preference_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    notification_type VARCHAR(50),
    old_settings JSONB,
    new_settings JSONB,
    changed_by VARCHAR(20) DEFAULT 'user' CHECK (changed_by IN ('user', 'admin', 'system')),
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_preference_history_user ON notification_preference_history(user_id);
CREATE INDEX idx_notification_preference_history_type ON notification_preference_history(notification_type);
CREATE INDEX idx_notification_preference_history_created ON notification_preference_history(created_at);

-- ============================================================================
-- 4. NOTIFICATION PRIORITY CONFIGURATION
-- ============================================================================

-- Add priority column to notification_types table
ALTER TABLE notification_types
ADD COLUMN IF NOT EXISTS default_priority VARCHAR(10) DEFAULT 'medium' CHECK (default_priority IN ('high', 'medium', 'low'));

-- Update existing notification types with smart priority defaults
UPDATE notification_types SET default_priority = 'high' WHERE key IN (
    'assignment_created',
    'message_received',
    'feedback_received',
    'assignment_due_reminder',
    'consultant_assigned'
);

UPDATE notification_types SET default_priority = 'medium' WHERE key IN (
    'course_completed',
    'course_enrolled',
    'course_progress_update',
    'team_member_added',
    'team_member_removed',
    'comment_received'
);

UPDATE notification_types SET default_priority = 'low' WHERE key IN (
    'general_announcement',
    'system_update',
    'course_updated',
    'profile_updated',
    'permission_granted',
    'permission_revoked',
    'assignment_graded',
    'achievement_earned',
    'session_reminder'
);

-- ============================================================================
-- 5. ENHANCED INDIVIDUAL PREFERENCES TABLE
-- ============================================================================

-- Add per-notification-type preference settings
ALTER TABLE user_notification_preferences
ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}';

-- Function to initialize notification settings with smart defaults
CREATE OR REPLACE FUNCTION initialize_notification_settings(p_user_id UUID, p_user_role VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_settings JSONB;
    v_notification_type RECORD;
BEGIN
    v_settings := '{}'::JSONB;
    
    -- Loop through all notification types and set smart defaults
    FOR v_notification_type IN SELECT key, default_priority FROM notification_types LOOP
        -- Admin defaults
        IF p_user_role = 'admin' THEN
            v_settings := v_settings || jsonb_build_object(
                v_notification_type.key, jsonb_build_object(
                    'in_app_enabled', true,
                    'email_enabled', CASE 
                        WHEN v_notification_type.default_priority = 'high' THEN true
                        ELSE false
                    END,
                    'frequency', CASE
                        WHEN v_notification_type.key IN ('system_update', 'user_management') THEN 'immediate'
                        ELSE 'daily'
                    END,
                    'priority', v_notification_type.default_priority
                )
            );
        -- Instructor defaults
        ELSIF p_user_role = 'docente' THEN
            v_settings := v_settings || jsonb_build_object(
                v_notification_type.key, jsonb_build_object(
                    'in_app_enabled', true,
                    'email_enabled', v_notification_type.key IN ('assignment_created', 'message_received', 'feedback_received'),
                    'frequency', CASE
                        WHEN v_notification_type.key IN ('assignment_created', 'message_received') THEN 'immediate'
                        ELSE 'daily'
                    END,
                    'priority', v_notification_type.default_priority
                )
            );
        -- Student defaults
        ELSE
            v_settings := v_settings || jsonb_build_object(
                v_notification_type.key, jsonb_build_object(
                    'in_app_enabled', true,
                    'email_enabled', v_notification_type.key IN ('assignment_created', 'feedback_received', 'assignment_due_reminder'),
                    'frequency', CASE
                        WHEN v_notification_type.default_priority = 'high' THEN 'immediate'
                        WHEN v_notification_type.default_priority = 'medium' THEN 'daily'
                        ELSE 'weekly'
                    END,
                    'priority', v_notification_type.default_priority
                )
            );
        END IF;
    END LOOP;
    
    RETURN v_settings;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if current time is within quiet hours
CREATE OR REPLACE FUNCTION is_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_quiet_start TIME;
    v_quiet_end TIME;
    v_weekend_quiet BOOLEAN;
    v_current_time TIME;
    v_is_weekend BOOLEAN;
    v_dnd BOOLEAN;
BEGIN
    -- Get user's quiet hour settings
    SELECT quiet_hours_start, quiet_hours_end, weekend_quiet, do_not_disturb
    INTO v_quiet_start, v_quiet_end, v_weekend_quiet, v_dnd
    FROM user_notification_preferences
    WHERE user_id = p_user_id;
    
    -- If DND is on, always return true
    IF v_dnd THEN
        RETURN true;
    END IF;
    
    v_current_time := LOCALTIME;
    v_is_weekend := EXTRACT(DOW FROM CURRENT_DATE) IN (0, 6);
    
    -- Check weekend quiet
    IF v_is_weekend AND v_weekend_quiet THEN
        RETURN true;
    END IF;
    
    -- Check quiet hours (handle overnight periods)
    IF v_quiet_start > v_quiet_end THEN
        -- Overnight period (e.g., 22:00 to 07:00)
        RETURN v_current_time >= v_quiet_start OR v_current_time <= v_quiet_end;
    ELSE
        -- Same day period
        RETURN v_current_time >= v_quiet_start AND v_current_time <= v_quiet_end;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check if notification should be sent based on user preferences
CREATE OR REPLACE FUNCTION should_send_notification(
    p_user_id UUID,
    p_notification_type VARCHAR,
    p_priority VARCHAR DEFAULT 'medium'
)
RETURNS TABLE(send_in_app BOOLEAN, send_email BOOLEAN, email_frequency VARCHAR) AS $$
DECLARE
    v_preferences RECORD;
    v_notification_settings JSONB;
    v_is_quiet_hours BOOLEAN;
BEGIN
    -- Get user preferences
    SELECT * INTO v_preferences
    FROM user_notification_preferences
    WHERE user_id = p_user_id;
    
    -- Get specific notification settings
    v_notification_settings := v_preferences.notification_settings->p_notification_type;
    
    -- Check quiet hours
    v_is_quiet_hours := is_quiet_hours(p_user_id);
    
    -- Default values if no specific settings
    IF v_notification_settings IS NULL THEN
        send_in_app := NOT v_is_quiet_hours OR (v_preferences.priority_override AND p_priority = 'high');
        send_email := NOT v_is_quiet_hours OR (v_preferences.priority_override AND p_priority = 'high');
        email_frequency := 'immediate';
    ELSE
        -- Check if notification is enabled
        send_in_app := (v_notification_settings->>'in_app_enabled')::BOOLEAN 
                      AND (NOT v_is_quiet_hours OR (v_preferences.priority_override AND p_priority = 'high'));
        send_email := (v_notification_settings->>'email_enabled')::BOOLEAN 
                     AND (NOT v_is_quiet_hours OR (v_preferences.priority_override AND p_priority = 'high'));
        email_frequency := COALESCE(v_notification_settings->>'frequency', 'immediate');
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to add notification to digest queue
CREATE OR REPLACE FUNCTION add_to_digest_queue(
    p_user_id UUID,
    p_notification_id UUID,
    p_digest_type VARCHAR
)
RETURNS VOID AS $$
DECLARE
    v_scheduled_for TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate scheduled time based on digest type
    IF p_digest_type = 'daily' THEN
        -- Next day at 9 AM
        v_scheduled_for := date_trunc('day', CURRENT_TIMESTAMP + INTERVAL '1 day') + INTERVAL '9 hours';
    ELSIF p_digest_type = 'weekly' THEN
        -- Next Monday at 9 AM
        v_scheduled_for := date_trunc('week', CURRENT_TIMESTAMP) + INTERVAL '7 days' + INTERVAL '9 hours';
    END IF;
    
    -- Insert or update digest queue
    INSERT INTO email_digest_queue (user_id, notification_ids, digest_type, scheduled_for)
    VALUES (p_user_id, ARRAY[p_notification_id], p_digest_type, v_scheduled_for)
    ON CONFLICT (user_id, digest_type, scheduled_for)
    DO UPDATE SET notification_ids = array_append(email_digest_queue.notification_ids, p_notification_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE email_digest_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preference_history ENABLE ROW LEVEL SECURITY;

-- Policies for email_digest_queue
CREATE POLICY "Users can view their own digest queue" ON email_digest_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage all digest queues" ON email_digest_queue
    FOR ALL USING (auth.uid() IS NOT NULL);

-- Policies for notification_preference_history
CREATE POLICY "Users can view their own preference history" ON notification_preference_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert preference history" ON notification_preference_history
    FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 8. MIGRATION TO INITIALIZE EXISTING USERS
-- ============================================================================

-- Initialize notification settings for existing users
DO $$
DECLARE
    v_user RECORD;
BEGIN
    FOR v_user IN SELECT id, role FROM profiles LOOP
        -- Update preferences with smart defaults if not already set
        UPDATE user_notification_preferences
        SET notification_settings = initialize_notification_settings(v_user.id, v_user.role)
        WHERE user_id = v_user.id AND (notification_settings IS NULL OR notification_settings = '{}'::JSONB);
    END LOOP;
END $$;

-- ============================================================================
-- 9. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_settings ON user_notification_preferences USING GIN (notification_settings);
CREATE INDEX IF NOT EXISTS idx_notification_preference_history_settings ON notification_preference_history USING GIN (old_settings, new_settings);

-- ============================================================================
-- 10. SAMPLE DATA FOR TESTING (OPTIONAL)
-- ============================================================================

-- Uncomment to add sample preference changes for testing
/*
INSERT INTO notification_preference_history (user_id, notification_type, old_settings, new_settings, changed_by, change_reason)
SELECT 
    (SELECT id FROM profiles WHERE email = 'admin@fne.cl' LIMIT 1),
    'assignment_created',
    '{"in_app_enabled": true, "email_enabled": true, "frequency": "immediate"}'::JSONB,
    '{"in_app_enabled": true, "email_enabled": false, "frequency": "daily"}'::JSONB,
    'user',
    'Too many emails, switching to daily digest'
WHERE EXISTS (SELECT 1 FROM profiles WHERE email = 'admin@fne.cl');
*/