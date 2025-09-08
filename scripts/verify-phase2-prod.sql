-- Production Verification Queries for Phase 2 Migrations
-- Run these in Supabase SQL Editor (PRODUCTION)
-- All queries are READ-ONLY

-- ============================================
-- 1. BASELINE TABLE VERIFICATION
-- ============================================

-- Check if baseline table exists and count rows
SELECT 
  'Baseline table row count' as check_name,
  count(*) as result,
  CASE 
    WHEN count(*) = 72 THEN '✅ PASS - Expected 72 rows'
    WHEN count(*) > 0 THEN '⚠️  WARNING - Found ' || count(*) || ' rows, expected 72'
    ELSE '❌ FAIL - No baseline data found'
  END as status
FROM role_permission_baseline;

-- Sample baseline permissions for admin and docente
SELECT 
  'Sample baseline permissions' as check_name,
  role_type, 
  permission_key, 
  granted,
  metadata->>'category' as category
FROM role_permission_baseline 
WHERE role_type IN ('admin', 'docente')
ORDER BY role_type, permission_key 
LIMIT 10;

-- ============================================
-- 2. RPC FUNCTION VERIFICATION
-- ============================================

-- Test get_effective_permissions function
SELECT 
  'RPC function test - admin' as check_name,
  permission_key,
  granted,
  source
FROM get_effective_permissions('admin', NULL) 
ORDER BY permission_key;

-- Check if function exists with correct signature
SELECT 
  'RPC function existence' as check_name,
  proname as function_name,
  prosecdef as is_security_definer,
  pronargs as arg_count
FROM pg_proc 
WHERE proname IN ('get_effective_permissions', 'get_baseline_permissions', 'auth_is_superadmin');

-- ============================================
-- 3. TEST OVERLAY VERIFICATION
-- ============================================

-- Check for any active test overlays (should be 0)
-- Note: This query will fail if role_permissions table doesn't exist (Phase 1 not deployed)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'role_permissions') THEN
    RAISE NOTICE 'Checking role_permissions table for active overlays...';
  ELSE
    RAISE NOTICE 'role_permissions table does not exist (Phase 1 not deployed) - skipping overlay check';
  END IF;
END $$;

SELECT 
  'Active test overlays' as check_name,
  CASE 
    WHEN NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'role_permissions') 
    THEN 0
    ELSE (SELECT count(*) FROM role_permissions WHERE is_test = true AND active = true)
  END as active_overlays,
  CASE 
    WHEN NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'role_permissions')
    THEN '✅ PASS - Table not created yet (Phase 1 not deployed)'
    WHEN (SELECT count(*) FROM role_permissions WHERE is_test = true AND active = true) = 0 
    THEN '✅ PASS - No active test overlays'
    ELSE '⚠️  WARNING - Found active test overlays'
  END as status;

-- List any active test overlays if they exist (only if table exists)
-- This query will only run if role_permissions table exists and has active overlays
WITH overlay_check AS (
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'role_permissions'
  ) as table_exists
)
SELECT 
  'Active overlay details' as check_name,
  CASE 
    WHEN NOT oc.table_exists THEN 'Table not found - Phase 1 not deployed'
    WHEN rp.role_type IS NULL THEN 'No active overlays found'
    ELSE rp.role_type || '/' || rp.permission_key
  END as overlay_info,
  rp.test_run_id,
  rp.expires_at
FROM overlay_check oc
LEFT JOIN LATERAL (
  SELECT * FROM role_permissions 
  WHERE is_test = true AND active = true
  LIMIT 5
) rp ON oc.table_exists;

-- Check test_mode_state (skip if table doesn't exist)
SELECT 
  'Test mode state' as check_name,
  CASE 
    WHEN NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'test_mode_state')
    THEN 0
    ELSE (SELECT count(*) FROM test_mode_state WHERE enabled = true)
  END as enabled_test_modes,
  CASE 
    WHEN NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'test_mode_state')
    THEN '✅ PASS - Table not created yet (Phase 1 not deployed)'
    WHEN (SELECT count(*) FROM test_mode_state WHERE enabled = true) = 0
    THEN '✅ PASS - No test modes enabled'
    ELSE '⚠️  WARNING - Found enabled test modes'
  END as status;

-- ============================================
-- 4. SECURITY VERIFICATION
-- ============================================

-- Check baseline table policies (should be SELECT only)
SELECT 
  'Baseline table policies' as check_name,
  policyname as policy_name, 
  cmd as command_type,
  CASE 
    WHEN cmd = 'SELECT' THEN '✅ PASS - Read-only policy'
    ELSE '❌ FAIL - Write policy found'
  END as status
FROM pg_policies 
WHERE tablename = 'role_permission_baseline';

-- Verify auth functions are SECURITY DEFINER
SELECT 
  'Auth function security' as check_name,
  proname as function_name, 
  prosecdef as is_security_definer,
  CASE 
    WHEN prosecdef THEN '✅ PASS - SECURITY DEFINER'
    ELSE '❌ FAIL - Not SECURITY DEFINER'
  END as status
FROM pg_proc 
WHERE proname LIKE 'auth_is_superadmin%';

-- Check events table has both USING and WITH CHECK
SELECT 
  'Events table policies' as check_name,
  policyname as policy_name, 
  cmd as command,
  CASE 
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'Missing USING clause'
  END as using_status,
  CASE 
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
    ELSE 'Missing WITH CHECK clause'
  END as check_status
FROM pg_policies 
WHERE tablename = 'events';

-- ============================================
-- 5. SUMMARY REPORT
-- ============================================

SELECT 
  'VERIFICATION SUMMARY' as report,
  NOW() as timestamp,
  'Phase 2 Migrations (003/004/005)' as scope,
  'Production Environment' as environment;

-- Final safety check
SELECT 
  'OVERALL STATUS' as assessment,
  CASE 
    WHEN (SELECT count(*) FROM role_permission_baseline) = 72
     AND (
       NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'role_permissions')
       OR (SELECT count(*) FROM role_permissions WHERE is_test = true AND active = true) = 0
     )
     AND (
       NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'test_mode_state')
       OR (SELECT count(*) FROM test_mode_state WHERE enabled = true) = 0
     )
    THEN '✅ SAFE - Baseline loaded, no active test modes'
    WHEN (SELECT count(*) FROM role_permission_baseline) != 72
    THEN '⚠️  REVIEW - Baseline table has unexpected row count'
    ELSE '⚠️  REVIEW - Check individual results above'
  END as status;