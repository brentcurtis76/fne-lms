-- ============================================================================
-- Learning Path Progress Fixes
-- - Grant EXECUTE on progress RPCs to authenticated
-- - Allow assigned users to update their own assignment progress
-- - Add atomic increment function for total_time_spent_minutes
-- ============================================================================

-- 1) Grant EXECUTE on existing RPCs
DO $$
BEGIN
  IF to_regprocedure('public.start_learning_path_session(uuid,uuid,uuid,character varying)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.start_learning_path_session(uuid,uuid,uuid,character varying) TO authenticated;
  END IF;
  IF to_regprocedure('public.end_learning_path_session(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.end_learning_path_session(uuid) TO authenticated;
  END IF;
  IF to_regprocedure('public.update_session_heartbeat(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.update_session_heartbeat(uuid) TO authenticated;
  END IF;
END $$;

-- 2) RLS policy: allow assigned user to update own assignment progress
--    Restricts to users who are the direct assignee (user_id = auth.uid())
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename='learning_path_assignments' 
      AND policyname = 'learning_path_assignments_user_progress_update'
  ) THEN
    CREATE POLICY "learning_path_assignments_user_progress_update" 
    ON public.learning_path_assignments 
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- 3) Atomic increment helper for total_time_spent_minutes
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

GRANT EXECUTE ON FUNCTION public.increment_path_assignment_time(uuid,uuid,integer) TO authenticated;

