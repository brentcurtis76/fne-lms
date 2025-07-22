-- Learning Path Progress Tracking Infrastructure
-- Phase 1: Core tracking tables, indexes, and enhancements

-- 1. Create progress sessions table for detailed activity tracking
CREATE TABLE IF NOT EXISTS "public"."learning_path_progress_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "path_id" "uuid" NOT NULL,
    "course_id" "uuid" NULL, -- NULL for path-level sessions
    "session_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_end" timestamp with time zone NULL,
    "time_spent_minutes" integer DEFAULT 0,
    "activity_type" character varying(50) NOT NULL, -- 'path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete'
    "session_data" "jsonb" DEFAULT '{}'::"jsonb", -- Additional metadata (page, interactions, etc.)
    "last_heartbeat" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- 2. Add progress tracking columns to learning_path_assignments
ALTER TABLE "public"."learning_path_assignments" 
ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone DEFAULT "now"(),
ADD COLUMN IF NOT EXISTS "current_course_sequence" integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS "estimated_completion_minutes" integer NULL,
ADD COLUMN IF NOT EXISTS "total_time_spent_minutes" integer DEFAULT 0;

-- 3. Create summary table for pre-aggregated analytics
CREATE TABLE IF NOT EXISTS "public"."learning_path_progress_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "path_id" "uuid" NOT NULL,
    "summary_date" date NOT NULL,
    "total_users_assigned" integer DEFAULT 0,
    "total_users_started" integer DEFAULT 0,
    "total_users_completed" integer DEFAULT 0,
    "avg_completion_time_minutes" numeric(10,2) DEFAULT 0,
    "total_time_spent_minutes" integer DEFAULT 0,
    "completion_rate_percentage" numeric(5,2) DEFAULT 0,
    "course_dropout_data" "jsonb" DEFAULT '{}'::"jsonb", -- Which courses have highest dropout
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_path_progress_summary_path_date_unique" UNIQUE ("path_id", "summary_date")
);

-- 4. Set up primary keys and constraints
ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."learning_path_progress_summary"
    ADD CONSTRAINT "learning_path_progress_summary_pkey" PRIMARY KEY ("id");

-- 5. Create foreign key relationships
ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_path_id_fkey" 
    FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_course_id_fkey" 
    FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."learning_path_progress_summary"
    ADD CONSTRAINT "learning_path_progress_summary_path_id_fkey" 
    FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;

-- 6. Create performance-optimized indexes
-- Primary analytics queries: user progress tracking
CREATE INDEX "idx_progress_sessions_user_path_date" ON "public"."learning_path_progress_sessions" 
("user_id", "path_id", DATE("session_start"));

-- Analytics queries: path performance over time
CREATE INDEX "idx_progress_sessions_analytics" ON "public"."learning_path_progress_sessions" 
("path_id", "activity_type", "session_start") 
WHERE "session_start" > NOW() - INTERVAL '90 days';

-- Active session cleanup queries
CREATE INDEX "idx_progress_sessions_cleanup" ON "public"."learning_path_progress_sessions" 
("session_end", "last_heartbeat") 
WHERE "session_end" IS NULL;

-- Assignment status queries
CREATE INDEX "idx_learning_path_assignments_progress" ON "public"."learning_path_assignments" 
("path_id", "started_at", "completed_at", "last_activity_at");

-- Summary analytics queries
CREATE INDEX "idx_progress_summary_path_date" ON "public"."learning_path_progress_summary" 
("path_id", "summary_date" DESC);

-- 7. Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Set up updated_at triggers
CREATE TRIGGER "learning_path_progress_sessions_updated_at"
    BEFORE UPDATE ON "public"."learning_path_progress_sessions"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE TRIGGER "learning_path_progress_summary_updated_at"
    BEFORE UPDATE ON "public"."learning_path_progress_summary"
    FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- 9. Set up Row Level Security policies
ALTER TABLE "public"."learning_path_progress_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."learning_path_progress_summary" ENABLE ROW LEVEL SECURITY;

-- Users can only see their own session data
CREATE POLICY "Users can view own progress sessions" ON "public"."learning_path_progress_sessions"
    FOR SELECT USING ("user_id" = "auth"."uid"());

CREATE POLICY "Users can insert own progress sessions" ON "public"."learning_path_progress_sessions"
    FOR INSERT WITH CHECK ("user_id" = "auth"."uid"());

CREATE POLICY "Users can update own progress sessions" ON "public"."learning_path_progress_sessions"
    FOR UPDATE USING ("user_id" = "auth"."uid"());

-- Admin/equipo_directivo/consultor can view all summary data
CREATE POLICY "Admins can view progress summaries" ON "public"."learning_path_progress_summary"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles" 
            WHERE "user_id" = "auth"."uid"() 
            AND "role_type" IN ('admin', 'equipo_directivo', 'consultor')
            AND "is_active" = true
        )
    );

-- Service role can manage all data (for background jobs)
CREATE POLICY "Service role full access sessions" ON "public"."learning_path_progress_sessions"
    FOR ALL USING ("auth"."jwt"() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access summaries" ON "public"."learning_path_progress_summary"
    FOR ALL USING ("auth"."jwt"() ->> 'role' = 'service_role');

-- 10. Grant necessary permissions
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."learning_path_progress_summary" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_progress_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_progress_summary" TO "service_role";

-- 11. Create helper function to start a new learning path session
CREATE OR REPLACE FUNCTION "public"."start_learning_path_session"(
    "p_user_id" "uuid",
    "p_path_id" "uuid",
    "p_course_id" "uuid" DEFAULT NULL,
    "p_activity_type" character varying DEFAULT 'path_view'
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    session_id UUID;
BEGIN
    -- Close any existing open sessions for this user/path combination
    UPDATE learning_path_progress_sessions 
    SET session_end = NOW(),
        time_spent_minutes = EXTRACT(EPOCH FROM (NOW() - session_start)) / 60
    WHERE user_id = p_user_id 
    AND path_id = p_path_id 
    AND session_end IS NULL;
    
    -- Create new session
    INSERT INTO learning_path_progress_sessions (
        user_id, path_id, course_id, activity_type
    ) VALUES (
        p_user_id, p_path_id, p_course_id, p_activity_type
    ) RETURNING id INTO session_id;
    
    -- Update assignment last activity
    UPDATE learning_path_assignments 
    SET last_activity_at = NOW(),
        started_at = COALESCE(started_at, NOW())
    WHERE user_id = p_user_id AND path_id = p_path_id;
    
    RETURN session_id;
END;
$$;

-- 12. Create helper function to end a session
CREATE OR REPLACE FUNCTION "public"."end_learning_path_session"(
    "p_session_id" "uuid"
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE learning_path_progress_sessions 
    SET session_end = NOW(),
        time_spent_minutes = EXTRACT(EPOCH FROM (NOW() - session_start)) / 60,
        updated_at = NOW()
    WHERE id = p_session_id 
    AND session_end IS NULL;
    
    RETURN FOUND;
END;
$$;

-- 13. Create helper function to update session heartbeat
CREATE OR REPLACE FUNCTION "public"."update_session_heartbeat"(
    "p_session_id" "uuid"
) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE learning_path_progress_sessions 
    SET last_heartbeat = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id 
    AND session_end IS NULL;
    
    RETURN FOUND;
END;
$$;

-- 14. Set permissions for helper functions
ALTER FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid", "p_activity_type" character varying) OWNER TO "postgres";
ALTER FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") OWNER TO "postgres";
ALTER FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid", "p_activity_type" character varying) IS 'Starts a new learning path session, closing any existing open sessions for the same user/path.';

COMMENT ON FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") IS 'Ends a learning path session and calculates total time spent.';

COMMENT ON FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") IS 'Updates the heartbeat timestamp for an active session to track user activity.';

-- 15. Create view for easy analytics queries
CREATE OR REPLACE VIEW "public"."learning_path_analytics_view" AS
SELECT 
    lp.id as path_id,
    lp.name as path_name,
    lp.description as path_description,
    COUNT(DISTINCT lpa.user_id) as total_assigned_users,
    COUNT(DISTINCT CASE WHEN lpa.started_at IS NOT NULL THEN lpa.user_id END) as started_users,
    COUNT(DISTINCT CASE WHEN lpa.completed_at IS NOT NULL THEN lpa.user_id END) as completed_users,
    ROUND(AVG(CASE WHEN lpa.completed_at IS NOT NULL THEN lpa.total_time_spent_minutes END), 2) as avg_completion_time_minutes,
    SUM(lpa.total_time_spent_minutes) as total_time_spent_minutes,
    ROUND(
        (COUNT(DISTINCT CASE WHEN lpa.completed_at IS NOT NULL THEN lpa.user_id END) * 100.0) / 
        NULLIF(COUNT(DISTINCT lpa.user_id), 0), 
        2
    ) as completion_rate_percentage
FROM learning_paths lp
LEFT JOIN learning_path_assignments lpa ON lp.id = lpa.path_id
GROUP BY lp.id, lp.name, lp.description
ORDER BY lp.created_at DESC;

GRANT SELECT ON "public"."learning_path_analytics_view" TO "authenticated";
GRANT SELECT ON "public"."learning_path_analytics_view" TO "service_role";

-- Migration complete
COMMENT ON TABLE "public"."learning_path_progress_sessions" IS 'Tracks detailed user sessions and activities within learning paths for analytics and progress monitoring.';
COMMENT ON TABLE "public"."learning_path_progress_summary" IS 'Pre-aggregated daily summaries for fast analytics queries on learning path performance.';
COMMENT ON VIEW "public"."learning_path_analytics_view" IS 'Provides aggregated analytics data for learning path performance and engagement metrics.';