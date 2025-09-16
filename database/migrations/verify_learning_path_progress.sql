-- ============================================================================
-- LEARNING PATH PROGRESS TRACKING - COMPREHENSIVE VERIFICATION
-- Run each section in Supabase SQL Editor to verify deployment
-- ============================================================================

-- ============================================================================
-- STEP 1: VERIFY RPC FUNCTIONS EXIST AND ARE EXECUTABLE
-- ============================================================================
SELECT 
  '=== RPC FUNCTIONS STATUS ===' as section;

SELECT
  to_regprocedure('public.start_learning_path_session(uuid,uuid,uuid,character varying)') IS NOT NULL AS start_exists,
  to_regprocedure('public.end_learning_path_session(uuid)') IS NOT NULL AS end_exists,
  to_regprocedure('public.update_session_heartbeat(uuid)') IS NOT NULL AS heartbeat_exists,
  to_regprocedure('public.increment_path_assignment_time(uuid,uuid,integer)') IS NOT NULL AS increment_exists;

-- Check function permissions
SELECT 
  '=== RPC PERMISSIONS ===' as section,
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

-- ============================================================================
-- STEP 2: CHECK RLS POLICIES FOR learning_path_assignments
-- ============================================================================
SELECT 
  '=== LEARNING PATH ASSIGNMENTS RLS POLICIES ===' as section;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='learning_path_assignments'
ORDER BY policyname;

-- Check if users can update their own assignments
SELECT 
  '=== USER UPDATE POLICY CHECK ===' as section,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' 
      AND tablename='learning_path_assignments'
      AND cmd IN ('ALL', 'UPDATE')
      AND qual LIKE '%user_id = auth.uid()%'
  ) as has_user_update_policy;

-- ============================================================================
-- STEP 3: FIND REAL DOCENTE AND PATH IDS FOR TESTING
-- ============================================================================
SELECT 
  '=== SAMPLE DOCENTES (TEACHERS) ===' as section;

-- Find active docentes with assignments
WITH docentes AS (
  SELECT DISTINCT
    p.id as user_id,
    p.email,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as full_name,
    ur.role_type,
    ur.school_id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id
  WHERE ur.role_type = 'docente'
    AND ur.is_active = true
  LIMIT 5
)
SELECT * FROM docentes;

-- Find learning paths with assignments
SELECT 
  '=== ACTIVE LEARNING PATHS ===' as section;

WITH active_paths AS (
  SELECT DISTINCT
    lp.id as path_id,
    lp.name as path_name,
    lp.description,
    COUNT(DISTINCT lpa.id) as total_assignments,
    COUNT(DISTINCT lpa.user_id) as direct_users,
    COUNT(DISTINCT lpa.group_id) as group_assignments
  FROM learning_paths lp
  LEFT JOIN learning_path_assignments lpa ON lpa.path_id = lp.id
  WHERE lp.is_active = true
  GROUP BY lp.id, lp.name, lp.description
  HAVING COUNT(lpa.id) > 0
  ORDER BY total_assignments DESC
  LIMIT 5
)
SELECT * FROM active_paths;

-- Find specific docente assignments
SELECT 
  '=== DOCENTE ASSIGNMENTS (First 10) ===' as section;

-- Get assignments with progress tracking columns
SELECT 
  lpa.id as assignment_id,
  p.email as docente_email,
  COALESCE(p.first_name || ' ' || p.last_name, p.email) as docente_name,
  lp.name as path_name,
  lpa.user_id,
  lpa.path_id,
  lpa.group_id,
  lpa.total_time_spent_minutes,
  lpa.last_activity_at,
  lpa.progress_percentage,
  CASE 
    WHEN lpa.user_id IS NOT NULL THEN 'Direct Assignment'
    WHEN lpa.group_id IS NOT NULL THEN 'Group Assignment'
    ELSE 'Unknown'
  END as assignment_type
FROM learning_path_assignments lpa
JOIN learning_paths lp ON lp.id = lpa.path_id
LEFT JOIN profiles p ON p.id = lpa.user_id
WHERE lpa.user_id IN (
  SELECT ur.user_id 
  FROM user_roles ur 
  WHERE ur.role_type = 'docente' 
    AND ur.is_active = true
)
LIMIT 10;

-- ============================================================================
-- STEP 4: DATABASE-LEVEL SMOKE TEST
-- ============================================================================

-- IMPORTANT: Replace these with actual IDs from Step 3 results
-- Example values (REPLACE THESE):
-- docente_user_id: 'e4f5a123-b456-7890-abcd-ef1234567890'
-- path_id: 'a1b2c3d4-e5f6-7890-abcd-1234567890ab'

/*
-- 4a. Start a session (uncomment and replace IDs)
SELECT 
  '=== START SESSION TEST ===' as section,
  public.start_learning_path_session(
    '<docente_user_id>'::uuid,  -- Replace with actual docente ID
    '<path_id>'::uuid,           -- Replace with actual path ID
    NULL,
    'path_view'
  ) AS session_id;

-- Copy the session_id returned above for next steps
*/

/*
-- 4b. Update heartbeat (uncomment and use session_id from 4a)
SELECT 
  '=== HEARTBEAT TEST ===' as section,
  public.update_session_heartbeat('<session_id>'::uuid) AS heartbeat_ok;
*/

/*
-- 4c. End session (uncomment and use session_id from 4a)
SELECT 
  '=== END SESSION TEST ===' as section,
  public.end_learning_path_session('<session_id>'::uuid) AS end_ok;
*/

/*
-- 4d. Increment assignment time (uncomment and replace IDs)
SELECT 
  '=== INCREMENT TIME TEST ===' as section,
  public.increment_path_assignment_time(
    '<docente_user_id>'::uuid,  -- Replace with actual docente ID
    '<path_id>'::uuid,           -- Replace with actual path ID
    5                            -- Add 5 minutes
  ) AS increment_ok;
*/

/*
-- 4e. Verify assignment was updated (uncomment and replace IDs)
SELECT 
  '=== VERIFY TIME UPDATE ===' as section,
  user_id, 
  path_id, 
  total_time_spent_minutes,
  last_activity_at,
  progress_percentage,
  completed_at
FROM learning_path_assignments
WHERE user_id = '<docente_user_id>'  -- Replace with actual docente ID
  AND path_id = '<path_id>';          -- Replace with actual path ID
*/

-- ============================================================================
-- STEP 5: CHECK FOR GROUP-ONLY ASSIGNMENTS
-- ============================================================================
SELECT 
  '=== GROUP-ONLY ASSIGNMENTS CHECK ===' as section;

-- Find assignments that are group-only (no direct user)
SELECT 
  COUNT(*) as group_only_count,
  COUNT(DISTINCT group_id) as unique_groups
FROM learning_path_assignments
WHERE group_id IS NOT NULL 
  AND user_id IS NULL;

-- Sample group assignments (check if groups table exists first)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'groups') THEN
    -- If groups table exists, show group details
    RAISE NOTICE 'Groups table exists - showing group assignments with names';
  ELSE
    -- If groups table doesn't exist, just show group IDs
    RAISE NOTICE 'Groups table not found - showing group IDs only';
  END IF;
END $$;

SELECT 
  '=== SAMPLE GROUP ASSIGNMENTS ===' as section,
  lpa.id,
  lpa.group_id,
  lp.name as path_name,
  lpa.path_id,
  lpa.assigned_at,
  lpa.total_time_spent_minutes
FROM learning_path_assignments lpa
JOIN learning_paths lp ON lp.id = lpa.path_id
WHERE lpa.user_id IS NULL
  AND lpa.group_id IS NOT NULL
LIMIT 5;

-- ============================================================================
-- STEP 6: PROGRESS SESSION TABLE CHECK
-- ============================================================================
SELECT 
  '=== PROGRESS SESSIONS TABLE CHECK ===' as section,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_progress_sessions'
  ) as sessions_table_exists;

-- Check if table exists before querying
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_progress_sessions'
  ) THEN
    RAISE NOTICE 'Progress sessions table exists - checking recent sessions';
    -- Note: Can't dynamically execute SELECT in DO block, so we'll check separately
  ELSE
    RAISE NOTICE 'Progress sessions table does not exist - this may need to be created';
  END IF;
END $$;

-- If you see the table exists above, uncomment this to see recent sessions:
/*
SELECT 
  s.id as session_id,
  p.email as user_email,
  lp.name as path_name,
  s.activity_type,
  s.session_start,
  s.session_end,
  s.last_heartbeat,
  EXTRACT(EPOCH FROM (COALESCE(s.session_end, NOW()) - s.session_start))/60 as duration_minutes
FROM learning_path_progress_sessions s
JOIN profiles p ON p.id = s.user_id
JOIN learning_paths lp ON lp.id = s.path_id
ORDER BY s.session_start DESC
LIMIT 10;
*/

-- ============================================================================
-- STEP 7: FINAL SUMMARY
-- ============================================================================
SELECT 
  '=== DEPLOYMENT VERIFICATION SUMMARY ===' as section;

WITH checks AS (
  SELECT 
    -- RPC functions
    (SELECT COUNT(*) FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' 
       AND p.proname IN (
         'start_learning_path_session',
         'end_learning_path_session',
         'update_session_heartbeat',
         'increment_path_assignment_time'
       )
    ) = 4 as all_rpcs_exist,
    
    -- RLS policies
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' 
        AND tablename='learning_path_assignments'
        AND cmd IN ('ALL', 'UPDATE')
    ) as has_update_policies,
    
    -- Active assignments
    (SELECT COUNT(*) FROM learning_path_assignments) > 0 as has_assignments,
    
    -- Sessions table
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'learning_path_progress_sessions'
    ) as sessions_table_exists
)
SELECT 
  CASE 
    WHEN all_rpcs_exist AND has_update_policies AND has_assignments AND sessions_table_exists
    THEN '✅ ALL CHECKS PASSED - System ready for progress tracking'
    ELSE '❌ ISSUES DETECTED - Review individual checks above'
  END as final_status,
  all_rpcs_exist as "RPC Functions Ready",
  has_update_policies as "RLS Policies Configured",
  has_assignments as "Has Active Assignments",
  sessions_table_exists as "Sessions Table Exists"
FROM checks;

-- ============================================================================
-- END OF VERIFICATION SUITE
-- ============================================================================