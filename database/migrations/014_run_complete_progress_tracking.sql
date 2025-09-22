-- ============================================================================
-- COMPLETE LEARNING PATH PROGRESS TRACKING SETUP
-- Run this entire script in Supabase SQL Editor
-- ============================================================================

-- First, check what already exists
SELECT 
  '=== CHECKING EXISTING OBJECTS ===' as section,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_path_progress_sessions') as sessions_table_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'start_learning_path_session') as start_function_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'end_learning_path_session') as end_function_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'increment_path_assignment_time') as increment_function_exists;

-- ============================================================================
-- 1. CREATE PROGRESS SESSIONS TABLE (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "public"."learning_path_progress_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "user_id" "uuid" NOT NULL,
    "path_id" "uuid" NOT NULL,
    "course_id" "uuid" NULL,
    "session_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_end" timestamp with time zone NULL,
    "time_spent_minutes" integer DEFAULT 0,
    "activity_type" character varying(50) NOT NULL,
    "session_data" "jsonb" DEFAULT '{}'::"jsonb",
    "last_heartbeat" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- Add foreign keys if table was just created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'learning_path_progress_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."learning_path_progress_sessions"
      ADD CONSTRAINT "learning_path_progress_sessions_user_id_fkey" 
      FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'learning_path_progress_sessions_path_id_fkey'
  ) THEN
    ALTER TABLE "public"."learning_path_progress_sessions"
      ADD CONSTRAINT "learning_path_progress_sessions_path_id_fkey" 
      FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'learning_path_progress_sessions_course_id_fkey'
  ) THEN
    ALTER TABLE "public"."learning_path_progress_sessions"
      ADD CONSTRAINT "learning_path_progress_sessions_course_id_fkey" 
      FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_progress_sessions_user_path_date" 
  ON "public"."learning_path_progress_sessions" ("user_id", "path_id", DATE("session_start"));

CREATE INDEX IF NOT EXISTS "idx_progress_sessions_cleanup" 
  ON "public"."learning_path_progress_sessions" ("session_end", "last_heartbeat") 
  WHERE "session_end" IS NULL;

-- ============================================================================
-- 2. ENABLE RLS AND CREATE POLICIES
-- ============================================================================
ALTER TABLE "public"."learning_path_progress_sessions" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own progress sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Users can insert own progress sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Users can update own progress sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Service role full access sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Users can view own sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Users can create own sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Users can update own active sessions" ON "public"."learning_path_progress_sessions";
DROP POLICY IF EXISTS "Admins have full access to sessions" ON "public"."learning_path_progress_sessions";

-- Create new policies
CREATE POLICY "Users can view own progress sessions" ON "public"."learning_path_progress_sessions"
    FOR SELECT USING ("user_id" = "auth"."uid"() OR auth_is_admin());

CREATE POLICY "Users can insert own progress sessions" ON "public"."learning_path_progress_sessions"
    FOR INSERT WITH CHECK ("user_id" = "auth"."uid"());

CREATE POLICY "Users can update own progress sessions" ON "public"."learning_path_progress_sessions"
    FOR UPDATE USING ("user_id" = "auth"."uid"() AND "session_end" IS NULL);

CREATE POLICY "Admins full access sessions" ON "public"."learning_path_progress_sessions"
    FOR ALL USING (auth_is_admin()) WITH CHECK (auth_is_admin());

-- ============================================================================
-- 3. CREATE RPC FUNCTIONS
-- ============================================================================

-- Start session function
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

-- End session function
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

-- Update heartbeat function
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

-- Increment assignment time function (from 011 migration)
CREATE OR REPLACE FUNCTION public.increment_path_assignment_time(
  p_user_id uuid,
  p_path_id uuid,
  p_minutes integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.learning_path_assignments
  SET total_time_spent_minutes = COALESCE(total_time_spent_minutes, 0) + GREATEST(p_minutes, 0),
      last_activity_at = NOW()
  WHERE user_id = p_user_id
    AND path_id = p_path_id;
  
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "service_role";

GRANT EXECUTE ON FUNCTION public.start_learning_path_session(uuid,uuid,uuid,character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_learning_path_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_path_assignment_time(uuid,uuid,integer) TO authenticated;

-- ============================================================================
-- 5. VERIFY EVERYTHING IS READY
-- ============================================================================
SELECT 
  '=== FINAL VERIFICATION ===' as section;

WITH checks AS (
  SELECT 
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_path_progress_sessions') as table_exists,
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'start_learning_path_session') as start_func,
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'end_learning_path_session') as end_func,
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'update_session_heartbeat') as heartbeat_func,
    EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'increment_path_assignment_time') as increment_func,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'learning_path_progress_sessions') > 0 as has_policies
)
SELECT 
  CASE 
    WHEN table_exists AND start_func AND end_func AND heartbeat_func AND increment_func AND has_policies
    THEN '✅ ALL COMPONENTS READY - Progress tracking system is fully operational'
    ELSE '❌ MISSING COMPONENTS - Check individual results above'
  END as status,
  table_exists as "Sessions Table",
  start_func as "Start Function",
  end_func as "End Function", 
  heartbeat_func as "Heartbeat Function",
  increment_func as "Increment Function",
  has_policies as "RLS Policies"
FROM checks;

-- Show function permissions
SELECT 
  '=== FUNCTION PERMISSIONS ===' as section,
  p.proname as function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname IN (
    'start_learning_path_session',
    'end_learning_path_session',
    'update_session_heartbeat',
    'increment_path_assignment_time'
  )
ORDER BY p.proname;