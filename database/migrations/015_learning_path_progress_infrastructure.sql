-- ============================================================================
-- Learning Path Progress Infrastructure (Idempotent Setup)
-- Ensures all required tables, policies, and RPC functions exist so
-- learning path progress is tracked reliably for all users.
-- Run this entire script in the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure learning_path_assignments has the columns needed for progress
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_path_assignments
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS total_time_spent_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_percentage integer DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS current_course_sequence integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_completion_minutes integer;

-- ---------------------------------------------------------------------------
-- 2. Create learning_path_progress_sessions table (tracks live sessions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_path_progress_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  path_id uuid NOT NULL,
  course_id uuid,
  activity_type varchar(50) NOT NULL CHECK (
    activity_type IN ('path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete')
  ),
  session_start timestamptz NOT NULL DEFAULT NOW(),
  session_end timestamptz,
  time_spent_minutes integer DEFAULT 0,
  session_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_path_progress_sessions_time_valid
    CHECK (session_end IS NULL OR session_end >= session_start)
);

-- Add foreign keys if they do not exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'learning_path_progress_sessions'
      AND constraint_name = 'learning_path_progress_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE public.learning_path_progress_sessions
      ADD CONSTRAINT learning_path_progress_sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'learning_path_progress_sessions'
      AND constraint_name = 'learning_path_progress_sessions_path_id_fkey'
  ) THEN
    ALTER TABLE public.learning_path_progress_sessions
      ADD CONSTRAINT learning_path_progress_sessions_path_id_fkey
      FOREIGN KEY (path_id) REFERENCES public.learning_paths(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'learning_path_progress_sessions'
      AND constraint_name = 'learning_path_progress_sessions_course_id_fkey'
  ) THEN
    ALTER TABLE public.learning_path_progress_sessions
      ADD CONSTRAINT learning_path_progress_sessions_course_id_fkey
      FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Indexes optimised for lookups, analytics, and clean-up jobs
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_progress_sessions_user_path
  ON public.learning_path_progress_sessions (user_id, path_id, session_start);

CREATE INDEX IF NOT EXISTS idx_progress_sessions_activity
  ON public.learning_path_progress_sessions (path_id, activity_type, session_start DESC);

CREATE INDEX IF NOT EXISTS idx_progress_sessions_active
  ON public.learning_path_progress_sessions (session_end, last_heartbeat)
  WHERE session_end IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Updated-at trigger support
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'learning_path_progress_sessions_updated_at'
  ) THEN
    CREATE TRIGGER learning_path_progress_sessions_updated_at
      BEFORE UPDATE ON public.learning_path_progress_sessions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_path_progress_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own progress sessions" ON public.learning_path_progress_sessions;
DROP POLICY IF EXISTS "Users can insert own progress sessions" ON public.learning_path_progress_sessions;
DROP POLICY IF EXISTS "Users can update own progress sessions" ON public.learning_path_progress_sessions;
DROP POLICY IF EXISTS "Admins full access sessions" ON public.learning_path_progress_sessions;
DROP POLICY IF EXISTS "Service role full access sessions" ON public.learning_path_progress_sessions;

CREATE POLICY "Users can view own progress sessions" ON public.learning_path_progress_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.auth_is_admin());

CREATE POLICY "Users can insert own progress sessions" ON public.learning_path_progress_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own progress sessions" ON public.learning_path_progress_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND session_end IS NULL)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins full access sessions" ON public.learning_path_progress_sessions
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "Service role full access sessions" ON public.learning_path_progress_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Minimal grants: authenticated users read their sessions, service role manages all
GRANT SELECT ON public.learning_path_progress_sessions TO authenticated;
GRANT ALL ON public.learning_path_progress_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Progress RPC functions (idempotent definitions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_learning_path_session(
  p_user_id uuid,
  p_path_id uuid,
  p_course_id uuid DEFAULT NULL,
  p_activity_type varchar DEFAULT 'path_view'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Close any open sessions for this user/path
  UPDATE public.learning_path_progress_sessions
  SET session_end = NOW(),
      time_spent_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - session_start)) / 60)),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND path_id = p_path_id
    AND session_end IS NULL;

  -- Record the new session
  INSERT INTO public.learning_path_progress_sessions (user_id, path_id, course_id, activity_type)
  VALUES (p_user_id, p_path_id, p_course_id, p_activity_type)
  RETURNING id INTO v_session_id;

  -- Touch assignment progress metadata if assignment exists
  UPDATE public.learning_path_assignments
  SET started_at = COALESCE(started_at, NOW()),
      last_activity_at = NOW()
  WHERE user_id = p_user_id
    AND path_id = p_path_id;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_learning_path_session(
  p_session_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_record public.learning_path_progress_sessions;
BEGIN
  SELECT * INTO v_session_record
  FROM public.learning_path_progress_sessions
  WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_session_record.session_end IS NOT NULL THEN
    RETURN TRUE; -- already closed
  END IF;

  UPDATE public.learning_path_progress_sessions
  SET session_end = NOW(),
      time_spent_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - session_start)) / 60)),
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_heartbeat(
  p_session_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.learning_path_progress_sessions
  SET last_heartbeat = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id
    AND session_end IS NULL;

  RETURN FOUND;
END;
$$;

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

-- Ensure authenticated users can execute the RPCs
GRANT EXECUTE ON FUNCTION public.start_learning_path_session(uuid,uuid,uuid,character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_learning_path_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_session_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_path_assignment_time(uuid,uuid,integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Final verification helper output
-- ---------------------------------------------------------------------------
SELECT
  '=== LEARNING PATH PROGRESS INFRA STATUS ===' AS section,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_progress_sessions'
  ) AS sessions_table_exists,
  to_regprocedure('public.start_learning_path_session(uuid,uuid,uuid,character varying)') IS NOT NULL AS start_function_exists,
  to_regprocedure('public.end_learning_path_session(uuid)') IS NOT NULL AS end_function_exists,
  to_regprocedure('public.update_session_heartbeat(uuid)') IS NOT NULL AS heartbeat_function_exists,
  to_regprocedure('public.increment_path_assignment_time(uuid,uuid,integer)') IS NOT NULL AS increment_function_exists;
