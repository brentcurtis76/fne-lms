-- ============================================================================
-- Create Learning Path Progress Sessions Table
-- This table tracks individual learning sessions for progress monitoring
-- ============================================================================

-- Create the sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.learning_path_progress_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_id uuid NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  activity_type character varying(50) NOT NULL CHECK (
    activity_type IN ('path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete')
  ),
  session_start timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  session_end timestamp with time zone,
  last_heartbeat timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  CONSTRAINT valid_session_times CHECK (
    session_end IS NULL OR session_end >= session_start
  )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_progress_sessions_user_id 
  ON public.learning_path_progress_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_progress_sessions_path_id 
  ON public.learning_path_progress_sessions(path_id);

CREATE INDEX IF NOT EXISTS idx_progress_sessions_course_id 
  ON public.learning_path_progress_sessions(course_id) 
  WHERE course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_progress_sessions_dates 
  ON public.learning_path_progress_sessions(session_start, session_end);

CREATE INDEX IF NOT EXISTS idx_progress_sessions_active 
  ON public.learning_path_progress_sessions(user_id, path_id, session_end) 
  WHERE session_end IS NULL;

-- Enable RLS
ALTER TABLE public.learning_path_progress_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own sessions
CREATE POLICY "Users can view own sessions" 
  ON public.learning_path_progress_sessions 
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid() OR auth_is_admin());

-- Users can create their own sessions
CREATE POLICY "Users can create own sessions" 
  ON public.learning_path_progress_sessions 
  FOR INSERT 
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own active sessions
CREATE POLICY "Users can update own active sessions" 
  ON public.learning_path_progress_sessions 
  FOR UPDATE 
  TO authenticated
  USING (user_id = auth.uid() AND session_end IS NULL)
  WITH CHECK (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "Admins have full access to sessions" 
  ON public.learning_path_progress_sessions 
  FOR ALL 
  TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.learning_path_progress_sessions TO authenticated;

-- Verify table was created
SELECT 
  '=== PROGRESS SESSIONS TABLE CREATED ===' as status,
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'learning_path_progress_sessions'
GROUP BY table_name;

-- Show table structure
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'learning_path_progress_sessions'
ORDER BY ordinal_position;