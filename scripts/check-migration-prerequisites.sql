-- Check if prerequisite functions and objects exist before applying migration 003

-- 1. Check if auth_is_admin() function exists
SELECT 
  'auth_is_admin function' as object_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_is_admin')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 001 first!'
  END as status;

-- 2. Check if user_roles_cache materialized view exists
SELECT 
  'user_roles_cache view' as object_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'user_roles_cache')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run migration 001 first!'
  END as status;

-- 3. Check current policies on user_roles
SELECT 
  'Current user_roles policies' as info,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'user_roles';

-- 4. List current policies that will be dropped
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN policyname IN (
      'Users can view their own roles',
      'Admins can view all roles',
      'Service role can manage all roles',
      'Service role can insert roles',
      'Service role can update roles', 
      'Service role can delete roles',
      'Block all direct mutations from authenticated users'
    )
    THEN '⚠️ Will be dropped'
    ELSE '✅ Will remain'
  END as action
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;

-- 5. Check if RLS is enabled on user_roles
SELECT 
  'user_roles RLS' as object_type,
  CASE 
    WHEN relrowsecurity 
    THEN '✅ ENABLED'
    ELSE '❌ DISABLED - Enable RLS first!'
  END as status
FROM pg_class 
WHERE relname = 'user_roles';