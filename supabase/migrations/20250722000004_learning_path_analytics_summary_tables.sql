-- Learning Path Analytics Summary Tables
-- Pre-aggregated data for fast analytics queries
-- Created: 2025-07-22

BEGIN;

-- Daily summary table for path activity
CREATE TABLE IF NOT EXISTS learning_path_daily_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    
    -- User activity metrics
    total_active_users INTEGER DEFAULT 0,
    new_enrollments INTEGER DEFAULT 0,
    course_completions INTEGER DEFAULT 0,
    
    -- Time tracking metrics  
    total_session_time_minutes INTEGER DEFAULT 0,
    total_sessions_count INTEGER DEFAULT 0,
    avg_session_duration_minutes DECIMAL(10,2) DEFAULT 0,
    
    -- Progress metrics
    users_started INTEGER DEFAULT 0,
    users_in_progress INTEGER DEFAULT 0, 
    users_completed INTEGER DEFAULT 0,
    
    -- Performance metrics
    completion_rate DECIMAL(5,2) DEFAULT 0, -- Percentage of users who completed
    avg_completion_time_days DECIMAL(10,2) DEFAULT 0,
    
    -- Engagement metrics
    bounce_rate DECIMAL(5,2) DEFAULT 0, -- Users who left after first session
    return_rate DECIMAL(5,2) DEFAULT 0, -- Users who came back after first day
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(path_id, summary_date)
);

-- Monthly summary table for trend analysis
CREATE TABLE IF NOT EXISTS learning_path_monthly_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    summary_month DATE NOT NULL, -- First day of the month
    
    -- Aggregated monthly metrics
    total_active_users INTEGER DEFAULT 0,
    total_new_enrollments INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    total_session_time_hours DECIMAL(10,2) DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    
    -- Monthly averages
    avg_daily_active_users DECIMAL(10,2) DEFAULT 0,
    avg_session_duration_minutes DECIMAL(10,2) DEFAULT 0,
    avg_completion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Trend indicators
    completion_trend DECIMAL(5,2) DEFAULT 0, -- Change from previous month
    engagement_trend DECIMAL(5,2) DEFAULT 0, -- Change in avg session time
    enrollment_trend DECIMAL(5,2) DEFAULT 0, -- Change in new enrollments
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(path_id, summary_month)
);

-- Path performance summary (real-time aggregated view)
CREATE TABLE IF NOT EXISTS learning_path_performance_summary (
    path_id UUID PRIMARY KEY REFERENCES learning_paths(id) ON DELETE CASCADE,
    
    -- Current totals
    total_enrolled_users INTEGER DEFAULT 0,
    total_completed_users INTEGER DEFAULT 0,
    total_active_sessions INTEGER DEFAULT 0,
    total_time_spent_hours DECIMAL(12,2) DEFAULT 0,
    
    -- Performance metrics
    overall_completion_rate DECIMAL(5,2) DEFAULT 0,
    avg_completion_time_days DECIMAL(10,2) DEFAULT 0,
    avg_session_duration_minutes DECIMAL(10,2) DEFAULT 0,
    
    -- Engagement scores (0-100)
    engagement_score INTEGER DEFAULT 0, -- Based on time spent vs expected
    difficulty_score INTEGER DEFAULT 0, -- Based on completion rates and time
    popularity_score INTEGER DEFAULT 0, -- Based on enrollments and activity
    
    -- Course-level aggregations
    total_courses INTEGER DEFAULT 0,
    avg_course_completion_rate DECIMAL(5,2) DEFAULT 0,
    most_difficult_course_id UUID,
    most_popular_course_id UUID,
    
    -- Recent activity (last 30 days)
    recent_enrollments INTEGER DEFAULT 0,
    recent_completions INTEGER DEFAULT 0,
    recent_session_time_hours DECIMAL(10,2) DEFAULT 0,
    
    -- Timestamps
    first_enrollment_date TIMESTAMP WITH TIME ZONE,
    last_activity_date TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User progress summary for faster user-specific queries
CREATE TABLE IF NOT EXISTS user_learning_path_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    
    -- Progress tracking
    enrollment_date TIMESTAMP WITH TIME ZONE,
    start_date TIMESTAMP WITH TIME ZONE,
    completion_date TIMESTAMP WITH TIME ZONE,
    
    -- Current status
    status TEXT CHECK (status IN ('not_started', 'in_progress', 'completed', 'paused')) DEFAULT 'not_started',
    overall_progress_percentage INTEGER DEFAULT 0 CHECK (overall_progress_percentage >= 0 AND overall_progress_percentage <= 100),
    
    -- Course progress
    total_courses INTEGER DEFAULT 0,
    completed_courses INTEGER DEFAULT 0,
    current_course_sequence INTEGER DEFAULT 1,
    
    -- Time tracking
    total_time_spent_minutes INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    avg_session_minutes DECIMAL(10,2) DEFAULT 0,
    last_session_date TIMESTAMP WITH TIME ZONE,
    
    -- Performance metrics
    estimated_completion_date DATE,
    actual_vs_estimated_days INTEGER DEFAULT 0, -- Negative means ahead of schedule
    
    -- Engagement indicators
    days_since_last_activity INTEGER DEFAULT 0,
    is_at_risk BOOLEAN DEFAULT FALSE, -- Flagged for lack of activity
    completion_streak INTEGER DEFAULT 0, -- Consecutive days with activity
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, path_id)
);

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_daily_summary_path_date ON learning_path_daily_summary(path_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON learning_path_daily_summary(summary_date DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_summary_path_month ON learning_path_monthly_summary(path_id, summary_month DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_summary_month ON learning_path_monthly_summary(summary_month DESC);

CREATE INDEX IF NOT EXISTS idx_performance_completion_rate ON learning_path_performance_summary(overall_completion_rate DESC);
CREATE INDEX IF NOT EXISTS idx_performance_engagement ON learning_path_performance_summary(engagement_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_summary_user_id ON user_learning_path_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_summary_path_id ON user_learning_path_summary(path_id);
CREATE INDEX IF NOT EXISTS idx_user_summary_status ON user_learning_path_summary(status);
CREATE INDEX IF NOT EXISTS idx_user_summary_at_risk ON user_learning_path_summary(is_at_risk) WHERE is_at_risk = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_summary_last_activity ON user_learning_path_summary(last_session_date DESC);

-- Function to update daily summary
CREATE OR REPLACE FUNCTION update_learning_path_daily_summary(p_path_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_active_users INTEGER;
    v_new_enrollments INTEGER;
    v_course_completions INTEGER;
    v_total_session_time INTEGER;
    v_total_sessions INTEGER;
    v_avg_duration DECIMAL;
    v_users_started INTEGER;
    v_users_in_progress INTEGER;
    v_users_completed INTEGER;
    v_completion_rate DECIMAL;
BEGIN
    -- Calculate metrics for the specified date
    SELECT 
        COUNT(DISTINCT lps.user_id),
        COALESCE(SUM(lps.time_spent_minutes), 0),
        COUNT(lps.id)
    INTO v_total_active_users, v_total_session_time, v_total_sessions
    FROM learning_path_progress_sessions lps
    WHERE lps.path_id = p_path_id 
    AND DATE(lps.session_start) = p_date;
    
    -- Calculate average session duration
    v_avg_duration := CASE 
        WHEN v_total_sessions > 0 THEN v_total_session_time::DECIMAL / v_total_sessions 
        ELSE 0 
    END;
    
    -- Count new enrollments for this date
    SELECT COUNT(*)
    INTO v_new_enrollments
    FROM learning_path_assignments lpa
    WHERE lpa.path_id = p_path_id 
    AND DATE(lpa.assigned_at) = p_date;
    
    -- Count course completions for this date  
    SELECT COUNT(*)
    INTO v_course_completions
    FROM course_enrollments ce
    JOIN learning_path_courses lpc ON ce.course_id = lpc.course_id
    WHERE lpc.learning_path_id = p_path_id
    AND ce.progress_percentage = 100
    AND DATE(ce.completed_at) = p_date;
    
    -- Count users by status
    SELECT 
        COUNT(*) FILTER (WHERE lpa.started_at IS NOT NULL),
        COUNT(*) FILTER (WHERE lpa.started_at IS NOT NULL AND lpa.completed_at IS NULL),
        COUNT(*) FILTER (WHERE lpa.completed_at IS NOT NULL)
    INTO v_users_started, v_users_in_progress, v_users_completed
    FROM learning_path_assignments lpa
    WHERE lpa.path_id = p_path_id;
    
    -- Calculate completion rate
    v_completion_rate := CASE 
        WHEN v_users_started > 0 THEN (v_users_completed::DECIMAL / v_users_started * 100)
        ELSE 0 
    END;
    
    -- Upsert the daily summary
    INSERT INTO learning_path_daily_summary (
        path_id, summary_date, total_active_users, new_enrollments, 
        course_completions, total_session_time_minutes, total_sessions_count,
        avg_session_duration_minutes, users_started, users_in_progress,
        users_completed, completion_rate, updated_at
    )
    VALUES (
        p_path_id, p_date, v_total_active_users, v_new_enrollments,
        v_course_completions, v_total_session_time, v_total_sessions,
        v_avg_duration, v_users_started, v_users_in_progress,
        v_users_completed, v_completion_rate, NOW()
    )
    ON CONFLICT (path_id, summary_date)
    DO UPDATE SET
        total_active_users = EXCLUDED.total_active_users,
        new_enrollments = EXCLUDED.new_enrollments,
        course_completions = EXCLUDED.course_completions,
        total_session_time_minutes = EXCLUDED.total_session_time_minutes,
        total_sessions_count = EXCLUDED.total_sessions_count,
        avg_session_duration_minutes = EXCLUDED.avg_session_duration_minutes,
        users_started = EXCLUDED.users_started,
        users_in_progress = EXCLUDED.users_in_progress,
        users_completed = EXCLUDED.users_completed,
        completion_rate = EXCLUDED.completion_rate,
        updated_at = NOW();
END;
$$;

-- Function to update performance summary
CREATE OR REPLACE FUNCTION update_learning_path_performance_summary(p_path_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_enrolled INTEGER;
    v_total_completed INTEGER;
    v_total_time_hours DECIMAL;
    v_completion_rate DECIMAL;
    v_avg_completion_days DECIMAL;
    v_engagement_score INTEGER;
    v_total_courses INTEGER;
    v_recent_enrollments INTEGER;
    v_recent_completions INTEGER;
    v_first_enrollment TIMESTAMP;
    v_last_activity TIMESTAMP;
BEGIN
    -- Get basic metrics
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL),
        AVG(EXTRACT(days FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL)
    INTO v_total_enrolled, v_total_completed, v_avg_completion_days
    FROM learning_path_assignments
    WHERE path_id = p_path_id;
    
    -- Calculate completion rate
    v_completion_rate := CASE 
        WHEN v_total_enrolled > 0 THEN (v_total_completed::DECIMAL / v_total_enrolled * 100)
        ELSE 0 
    END;
    
    -- Get total time spent (convert minutes to hours)
    SELECT COALESCE(SUM(total_time_spent_minutes), 0) / 60.0
    INTO v_total_time_hours
    FROM learning_path_assignments
    WHERE path_id = p_path_id;
    
    -- Calculate engagement score (0-100) based on time vs expected
    SELECT COUNT(*)
    INTO v_total_courses
    FROM learning_path_courses
    WHERE learning_path_id = p_path_id;
    
    -- Simple engagement score calculation
    v_engagement_score := LEAST(100, GREATEST(0, 
        CASE 
            WHEN v_total_enrolled > 0 THEN 
                (v_total_time_hours / (v_total_enrolled * v_total_courses * 2)) * 100 -- Assuming 2 hours per course
            ELSE 0
        END::INTEGER
    ));
    
    -- Get recent activity (last 30 days)
    SELECT 
        COUNT(*) FILTER (WHERE assigned_at >= NOW() - INTERVAL '30 days'),
        COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '30 days')
    INTO v_recent_enrollments, v_recent_completions
    FROM learning_path_assignments
    WHERE path_id = p_path_id;
    
    -- Get first and last activity dates
    SELECT MIN(assigned_at), MAX(GREATEST(assigned_at, started_at, completed_at))
    INTO v_first_enrollment, v_last_activity
    FROM learning_path_assignments
    WHERE path_id = p_path_id;
    
    -- Upsert performance summary
    INSERT INTO learning_path_performance_summary (
        path_id, total_enrolled_users, total_completed_users, total_time_spent_hours,
        overall_completion_rate, avg_completion_time_days, engagement_score,
        total_courses, recent_enrollments, recent_completions,
        first_enrollment_date, last_activity_date, last_updated, updated_at
    )
    VALUES (
        p_path_id, v_total_enrolled, v_total_completed, v_total_time_hours,
        v_completion_rate, v_avg_completion_days, v_engagement_score,
        v_total_courses, v_recent_enrollments, v_recent_completions,
        v_first_enrollment, v_last_activity, NOW(), NOW()
    )
    ON CONFLICT (path_id)
    DO UPDATE SET
        total_enrolled_users = EXCLUDED.total_enrolled_users,
        total_completed_users = EXCLUDED.total_completed_users,
        total_time_spent_hours = EXCLUDED.total_time_spent_hours,
        overall_completion_rate = EXCLUDED.overall_completion_rate,
        avg_completion_time_days = EXCLUDED.avg_completion_time_days,
        engagement_score = EXCLUDED.engagement_score,
        total_courses = EXCLUDED.total_courses,
        recent_enrollments = EXCLUDED.recent_enrollments,
        recent_completions = EXCLUDED.recent_completions,
        first_enrollment_date = EXCLUDED.first_enrollment_date,
        last_activity_date = EXCLUDED.last_activity_date,
        last_updated = NOW(),
        updated_at = NOW();
END;
$$;

-- Function to update user summary
CREATE OR REPLACE FUNCTION update_user_learning_path_summary(p_user_id UUID, p_path_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assignment RECORD;
    v_total_courses INTEGER;
    v_completed_courses INTEGER;
    v_progress_pct INTEGER;
    v_total_time INTEGER;
    v_total_sessions INTEGER;
    v_last_session TIMESTAMP;
    v_days_since_activity INTEGER;
    v_status TEXT;
BEGIN
    -- Get assignment record
    SELECT * INTO v_assignment
    FROM learning_path_assignments
    WHERE user_id = p_user_id AND path_id = p_path_id;
    
    IF NOT FOUND THEN
        RETURN; -- No assignment exists
    END IF;
    
    -- Get course counts
    SELECT COUNT(*)
    INTO v_total_courses
    FROM learning_path_courses
    WHERE learning_path_id = p_path_id;
    
    -- Get completed courses
    SELECT COUNT(*)
    INTO v_completed_courses
    FROM course_enrollments ce
    JOIN learning_path_courses lpc ON ce.course_id = lpc.course_id
    WHERE lpc.learning_path_id = p_path_id
    AND ce.user_id = p_user_id
    AND ce.progress_percentage = 100;
    
    -- Calculate progress percentage
    v_progress_pct := CASE 
        WHEN v_total_courses > 0 THEN (v_completed_courses * 100 / v_total_courses)
        ELSE 0
    END;
    
    -- Get time and session data
    SELECT 
        COALESCE(SUM(time_spent_minutes), 0),
        COUNT(*),
        MAX(session_end)
    INTO v_total_time, v_total_sessions, v_last_session
    FROM learning_path_progress_sessions
    WHERE user_id = p_user_id AND path_id = p_path_id;
    
    -- Calculate days since last activity
    v_days_since_activity := CASE 
        WHEN v_last_session IS NOT NULL THEN 
            EXTRACT(days FROM (NOW() - v_last_session))::INTEGER
        ELSE 999 -- Very high number if no sessions
    END;
    
    -- Determine status
    v_status := CASE 
        WHEN v_assignment.completed_at IS NOT NULL THEN 'completed'
        WHEN v_assignment.started_at IS NOT NULL AND v_completed_courses > 0 THEN 'in_progress'
        WHEN v_assignment.started_at IS NOT NULL THEN 'in_progress'
        ELSE 'not_started'
    END;
    
    -- Upsert user summary
    INSERT INTO user_learning_path_summary (
        user_id, path_id, enrollment_date, start_date, completion_date,
        status, overall_progress_percentage, total_courses, completed_courses,
        current_course_sequence, total_time_spent_minutes, total_sessions,
        avg_session_minutes, last_session_date, days_since_last_activity,
        is_at_risk, updated_at
    )
    VALUES (
        p_user_id, p_path_id, v_assignment.assigned_at, v_assignment.started_at, 
        v_assignment.completed_at, v_status, v_progress_pct, v_total_courses,
        v_completed_courses, COALESCE(v_assignment.current_course_sequence, 1),
        v_total_time, v_total_sessions,
        CASE WHEN v_total_sessions > 0 THEN v_total_time::DECIMAL / v_total_sessions ELSE 0 END,
        v_last_session, v_days_since_activity, 
        (v_days_since_activity > 7 AND v_status = 'in_progress'), NOW()
    )
    ON CONFLICT (user_id, path_id)
    DO UPDATE SET
        start_date = EXCLUDED.start_date,
        completion_date = EXCLUDED.completion_date,
        status = EXCLUDED.status,
        overall_progress_percentage = EXCLUDED.overall_progress_percentage,
        total_courses = EXCLUDED.total_courses,
        completed_courses = EXCLUDED.completed_courses,
        current_course_sequence = EXCLUDED.current_course_sequence,
        total_time_spent_minutes = EXCLUDED.total_time_spent_minutes,
        total_sessions = EXCLUDED.total_sessions,
        avg_session_minutes = EXCLUDED.avg_session_minutes,
        last_session_date = EXCLUDED.last_session_date,
        days_since_last_activity = EXCLUDED.days_since_last_activity,
        is_at_risk = EXCLUDED.is_at_risk,
        updated_at = NOW();
END;
$$;

-- Trigger to update summaries when session data changes
CREATE OR REPLACE FUNCTION trigger_update_summaries()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update daily summary for the session date
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM update_learning_path_daily_summary(NEW.path_id, DATE(NEW.session_start));
        PERFORM update_learning_path_performance_summary(NEW.path_id);
        PERFORM update_user_learning_path_summary(NEW.user_id, NEW.path_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM update_learning_path_daily_summary(OLD.path_id, DATE(OLD.session_start));
        PERFORM update_learning_path_performance_summary(OLD.path_id);
        PERFORM update_user_learning_path_summary(OLD.user_id, OLD.path_id);
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_learning_path_summaries ON learning_path_progress_sessions;
CREATE TRIGGER trigger_update_learning_path_summaries
    AFTER INSERT OR UPDATE OR DELETE ON learning_path_progress_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_update_summaries();

-- Function for bulk summary refresh (for maintenance)
CREATE OR REPLACE FUNCTION refresh_all_learning_path_summaries()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_path_record RECORD;
    v_user_record RECORD;
    v_date_record RECORD;
    v_count INTEGER := 0;
BEGIN
    -- Refresh performance summaries for all paths
    FOR v_path_record IN SELECT id FROM learning_paths LOOP
        PERFORM update_learning_path_performance_summary(v_path_record.id);
        v_count := v_count + 1;
    END LOOP;
    
    -- Refresh user summaries
    FOR v_user_record IN 
        SELECT DISTINCT user_id, path_id 
        FROM learning_path_assignments 
    LOOP
        PERFORM update_user_learning_path_summary(v_user_record.user_id, v_user_record.path_id);
    END LOOP;
    
    -- Refresh daily summaries for last 30 days
    FOR v_date_record IN 
        SELECT DISTINCT DATE(session_start) as session_date, path_id
        FROM learning_path_progress_sessions 
        WHERE session_start >= NOW() - INTERVAL '30 days'
    LOOP
        PERFORM update_learning_path_daily_summary(v_date_record.path_id, v_date_record.session_date);
    END LOOP;
    
    RETURN 'Refreshed summaries for ' || v_count || ' learning paths';
END;
$$;

-- Grant appropriate permissions
GRANT SELECT ON learning_path_daily_summary TO authenticated;
GRANT SELECT ON learning_path_monthly_summary TO authenticated;
GRANT SELECT ON learning_path_performance_summary TO authenticated;
GRANT SELECT ON user_learning_path_summary TO authenticated;

-- RLS policies for summary tables
ALTER TABLE learning_path_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_monthly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_performance_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_path_summary ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read summary data
CREATE POLICY "Users can read daily summaries" ON learning_path_daily_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read monthly summaries" ON learning_path_monthly_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read performance summaries" ON learning_path_performance_summary FOR SELECT TO authenticated USING (true);

-- Users can only read their own user summaries
CREATE POLICY "Users can read own summaries" ON user_learning_path_summary FOR SELECT TO authenticated USING (
    auth.uid() = user_id OR 
    EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role_type IN ('admin', 'coordinador_general', 'supervisor_de_red')
    )
);

COMMIT;