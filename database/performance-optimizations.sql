-- Performance Optimizations for FNE LMS Reporting System
-- This script creates indexes and optimizations for better query performance

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- Lesson Progress Table Indexes
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_completed 
ON lesson_progress(user_id, completed_at) 
WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_progress_time_range 
ON lesson_progress(completed_at) 
WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_time 
ON lesson_progress(user_id, time_spent) 
WHERE time_spent IS NOT NULL;

-- Profiles Table Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role_school 
ON profiles(role, school_id) 
WHERE role IS NOT NULL AND school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_school_generation 
ON profiles(school_id, generation_id) 
WHERE school_id IS NOT NULL AND generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_generation_community 
ON profiles(generation_id, community_id) 
WHERE generation_id IS NOT NULL AND community_id IS NOT NULL;

-- Course Enrollments Indexes (if table exists)
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_status 
ON course_enrollments(user_id, enrollment_status) 
WHERE enrollment_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_user 
ON course_enrollments(course_id, user_id);

-- ================================
-- MATERIALIZED VIEWS FOR REPORTS
-- ================================

-- User Progress Summary View
CREATE MATERIALIZED VIEW IF NOT EXISTS user_progress_summary AS
SELECT 
    p.id as user_id,
    p.first_name || ' ' || p.last_name as user_name,
    p.email as user_email,
    p.role as user_role,
    s.name as school_name,
    g.name as generation_name,
    c.name as community_name,
    COALESCE(progress_stats.total_lessons_completed, 0) as total_lessons_completed,
    COALESCE(progress_stats.total_time_spent_minutes, 0) as total_time_spent_minutes,
    COALESCE(progress_stats.completion_percentage, 0) as completion_percentage,
    COALESCE(progress_stats.average_quiz_score, 0) as average_quiz_score,
    progress_stats.last_activity_date,
    COALESCE(course_stats.total_courses_enrolled, 0) as total_courses_enrolled,
    COALESCE(course_stats.completed_courses, 0) as completed_courses,
    COALESCE(course_stats.courses_in_progress, 0) as courses_in_progress
FROM profiles p
LEFT JOIN schools s ON p.school_id = s.id
LEFT JOIN generations g ON p.generation_id = g.id
LEFT JOIN communities c ON p.community_id = c.id
LEFT JOIN (
    SELECT 
        lp.user_id,
        COUNT(*) as total_lessons_completed,
        SUM(lp.time_spent) as total_time_spent_minutes,
        AVG(CASE WHEN lp.time_spent > 0 THEN 100 ELSE 0 END) as completion_percentage,
        AVG(lp.quiz_score) as average_quiz_score,
        MAX(lp.completed_at) as last_activity_date
    FROM lesson_progress lp
    WHERE lp.completed_at IS NOT NULL
    GROUP BY lp.user_id
) progress_stats ON p.id = progress_stats.user_id
LEFT JOIN (
    SELECT 
        ce.user_id,
        COUNT(*) as total_courses_enrolled,
        COUNT(CASE WHEN ce.completion_percentage >= 100 THEN 1 END) as completed_courses,
        COUNT(CASE WHEN ce.completion_percentage > 0 AND ce.completion_percentage < 100 THEN 1 END) as courses_in_progress
    FROM course_enrollments ce
    GROUP BY ce.user_id
) course_stats ON p.id = course_stats.user_id
WHERE p.role IN ('admin', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor', 'docente');

-- Create index on the materialized view
CREATE INDEX IF NOT EXISTS idx_user_progress_summary_role_school 
ON user_progress_summary(user_role, school_name);

CREATE INDEX IF NOT EXISTS idx_user_progress_summary_completion 
ON user_progress_summary(completion_percentage DESC);

CREATE INDEX IF NOT EXISTS idx_user_progress_summary_activity 
ON user_progress_summary(last_activity_date DESC NULLS LAST);

-- School Performance Summary View
CREATE MATERIALIZED VIEW IF NOT EXISTS school_performance_summary AS
SELECT 
    s.id as school_id,
    s.name as school_name,
    COUNT(DISTINCT p.id) as total_teachers,
    COUNT(DISTINCT CASE WHEN ups.last_activity_date >= NOW() - INTERVAL '7 days' THEN p.id END) as active_teachers,
    AVG(ups.completion_percentage) as avg_completion_percentage,
    SUM(ups.total_time_spent_minutes) as total_time_spent,
    AVG(ups.average_quiz_score) as avg_quiz_score,
    COUNT(DISTINCT CASE WHEN ups.completion_percentage >= 100 THEN p.id END) as completed_teachers
FROM schools s
LEFT JOIN profiles p ON s.id = p.school_id
LEFT JOIN user_progress_summary ups ON p.id = ups.user_id
WHERE p.role = 'docente' OR p.role IS NULL
GROUP BY s.id, s.name;

-- Community Performance Summary View
CREATE MATERIALIZED VIEW IF NOT EXISTS community_performance_summary AS
SELECT 
    c.id as community_id,
    c.name as community_name,
    s.name as school_name,
    g.name as generation_name,
    COUNT(DISTINCT p.id) as total_users,
    COUNT(DISTINCT CASE WHEN ups.last_activity_date >= NOW() - INTERVAL '7 days' THEN p.id END) as active_users,
    AVG(ups.completion_percentage) as avg_completion_rate,
    SUM(ups.total_time_spent_minutes) as total_time_spent,
    AVG(ups.average_quiz_score) as avg_quiz_score
FROM communities c
LEFT JOIN profiles p ON c.id = p.community_id
LEFT JOIN schools s ON p.school_id = s.id
LEFT JOIN generations g ON p.generation_id = g.id
LEFT JOIN user_progress_summary ups ON p.id = ups.user_id
GROUP BY c.id, c.name, s.name, g.name;

-- ================================
-- REFRESH FUNCTIONS
-- ================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_reporting_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW user_progress_summary;
    REFRESH MATERIALIZED VIEW school_performance_summary;
    REFRESH MATERIALIZED VIEW community_performance_summary;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- PERFORMANCE FUNCTIONS
-- ================================

-- Function to get user progress with filters
CREATE OR REPLACE FUNCTION get_user_progress_filtered(
    p_user_role text DEFAULT NULL,
    p_school_id uuid DEFAULT NULL,
    p_generation_id uuid DEFAULT NULL,
    p_community_id uuid DEFAULT NULL,
    p_search_term text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    user_id uuid,
    user_name text,
    user_email text,
    user_role text,
    school_name text,
    generation_name text,
    community_name text,
    total_lessons_completed bigint,
    total_time_spent_minutes bigint,
    completion_percentage numeric,
    average_quiz_score numeric,
    last_activity_date timestamp with time zone,
    total_courses_enrolled bigint,
    completed_courses bigint,
    courses_in_progress bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ups.user_id,
        ups.user_name,
        ups.user_email,
        ups.user_role,
        ups.school_name,
        ups.generation_name,
        ups.community_name,
        ups.total_lessons_completed,
        ups.total_time_spent_minutes,
        ups.completion_percentage,
        ups.average_quiz_score,
        ups.last_activity_date,
        ups.total_courses_enrolled,
        ups.completed_courses,
        ups.courses_in_progress
    FROM user_progress_summary ups
    WHERE 
        (p_user_role IS NULL OR ups.user_role = p_user_role)
        AND (p_school_id IS NULL OR EXISTS (
            SELECT 1 FROM profiles pr 
            WHERE pr.id = ups.user_id AND pr.school_id = p_school_id
        ))
        AND (p_generation_id IS NULL OR EXISTS (
            SELECT 1 FROM profiles pr 
            WHERE pr.id = ups.user_id AND pr.generation_id = p_generation_id
        ))
        AND (p_community_id IS NULL OR EXISTS (
            SELECT 1 FROM profiles pr 
            WHERE pr.id = ups.user_id AND pr.community_id = p_community_id
        ))
        AND (p_search_term IS NULL OR 
             ups.user_name ILIKE '%' || p_search_term || '%' OR
             ups.user_email ILIKE '%' || p_search_term || '%')
    ORDER BY ups.last_activity_date DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get analytics data
CREATE OR REPLACE FUNCTION get_analytics_data(
    p_user_id uuid,
    p_time_range_days integer DEFAULT 30,
    p_school_id uuid DEFAULT NULL,
    p_generation_id uuid DEFAULT NULL,
    p_community_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    result json;
    user_role text;
    start_date timestamp;
BEGIN
    -- Get user role for access control
    SELECT role INTO user_role FROM profiles WHERE id = p_user_id;
    
    -- Calculate start date
    start_date := NOW() - (p_time_range_days || ' days')::interval;
    
    WITH filtered_users AS (
        SELECT id FROM profiles p
        WHERE 
            (user_role = 'admin' OR p.school_id = (SELECT school_id FROM profiles WHERE id = p_user_id))
            AND (p_school_id IS NULL OR p.school_id = p_school_id)
            AND (p_generation_id IS NULL OR p.generation_id = p_generation_id)
            AND (p_community_id IS NULL OR p.community_id = p_community_id)
    ),
    progress_trends AS (
        SELECT 
            DATE_TRUNC('week', lp.completed_at) as week,
            COUNT(*) as lessons_completed,
            COUNT(DISTINCT lp.user_id) as unique_users
        FROM lesson_progress lp
        INNER JOIN filtered_users fu ON lp.user_id = fu.id
        WHERE lp.completed_at >= start_date
            AND lp.completed_at IS NOT NULL
        GROUP BY DATE_TRUNC('week', lp.completed_at)
        ORDER BY week
    ),
    time_trends AS (
        SELECT 
            DATE_TRUNC('week', lp.completed_at) as week,
            SUM(lp.time_spent) / 60 as total_hours,
            AVG(lp.time_spent) / 60 as avg_hours_per_session
        FROM lesson_progress lp
        INNER JOIN filtered_users fu ON lp.user_id = fu.id
        WHERE lp.completed_at >= start_date
            AND lp.completed_at IS NOT NULL
            AND lp.time_spent IS NOT NULL
        GROUP BY DATE_TRUNC('week', lp.completed_at)
        ORDER BY week
    ),
    kpi_data AS (
        SELECT
            COUNT(DISTINCT fu.id) as total_users,
            COUNT(DISTINCT CASE WHEN ups.last_activity_date >= NOW() - INTERVAL '7 days' THEN fu.id END) as active_users,
            AVG(ups.completion_percentage) as avg_completion_rate,
            SUM(ups.total_time_spent_minutes) / 60 as total_hours_spent
        FROM filtered_users fu
        LEFT JOIN user_progress_summary ups ON fu.id = ups.user_id
    )
    SELECT json_build_object(
        'progressTrends', COALESCE((SELECT json_agg(row_to_json(pt)) FROM progress_trends pt), '[]'::json),
        'timeTrends', COALESCE((SELECT json_agg(row_to_json(tt)) FROM time_trends tt), '[]'::json),
        'kpiData', (SELECT row_to_json(kd) FROM kpi_data kd),
        'metadata', json_build_object(
            'timeRange', p_time_range_days,
            'userRole', user_role,
            'generatedAt', NOW()
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- MAINTENANCE TASKS
-- ================================

-- Function to analyze and vacuum tables for performance
CREATE OR REPLACE FUNCTION maintain_reporting_performance()
RETURNS void AS $$
BEGIN
    -- Analyze tables
    ANALYZE lesson_progress;
    ANALYZE profiles;
    ANALYZE course_enrollments;
    
    -- Refresh materialized views
    PERFORM refresh_reporting_views();
    
    -- Log maintenance
    INSERT INTO system_logs (action, details, created_at)
    VALUES ('maintenance', 'Refreshed reporting views and analyzed tables', NOW());
    
    EXCEPTION WHEN OTHERS THEN
        -- Log error if system_logs table doesn't exist
        RAISE NOTICE 'Maintenance completed with warnings: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- AUTOMATIC REFRESH SCHEDULE
-- ================================

-- Create a trigger to refresh views when underlying data changes
CREATE OR REPLACE FUNCTION trigger_refresh_reporting_views()
RETURNS trigger AS $$
BEGIN
    -- Refresh views asynchronously (you might want to use pg_cron or similar)
    PERFORM refresh_reporting_views();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Only create triggers if they don't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'refresh_views_on_lesson_progress_change'
    ) THEN
        CREATE TRIGGER refresh_views_on_lesson_progress_change
        AFTER INSERT OR UPDATE OR DELETE ON lesson_progress
        FOR EACH STATEMENT
        EXECUTE FUNCTION trigger_refresh_reporting_views();
    END IF;
END $$;

-- ================================
-- PERFORMANCE MONITORING
-- ================================

-- View to monitor query performance
CREATE OR REPLACE VIEW reporting_query_stats AS
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation,
    most_common_vals,
    most_common_freqs
FROM pg_stats 
WHERE schemaname = 'public' 
  AND tablename IN ('lesson_progress', 'profiles', 'course_enrollments')
ORDER BY tablename, attname;

-- Function to check index usage
CREATE OR REPLACE FUNCTION check_index_usage()
RETURNS TABLE (
    table_name text,
    index_name text,
    index_scans bigint,
    tuples_read bigint,
    tuples_fetched bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname || '.' || tablename::text as table_name,
        indexrelname::text as index_name,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('lesson_progress', 'profiles', 'course_enrollments')
    ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- CLEANUP AND GRANTS
-- ================================

-- Grant appropriate permissions (adjust as needed for your user roles)
-- GRANT SELECT ON user_progress_summary TO authenticated;
-- GRANT SELECT ON school_performance_summary TO authenticated;
-- GRANT SELECT ON community_performance_summary TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_user_progress_filtered TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_analytics_data TO authenticated;

-- Initial refresh of materialized views
SELECT refresh_reporting_views();

-- Log completion
-- INSERT INTO system_logs (action, details, created_at)
-- VALUES ('setup', 'Performance optimizations applied successfully', NOW());