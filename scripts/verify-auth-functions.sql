-- Check if auth_is_admin() function exists
SELECT 
  proname as function_name,
  prorettype::regtype as return_type,
  prosrc as function_body
FROM pg_proc 
WHERE proname = 'auth_is_admin';

-- Check if auth_has_role() function exists
SELECT 
  proname as function_name,
  prorettype::regtype as return_type,
  prosrc as function_body
FROM pg_proc 
WHERE proname = 'auth_has_role';

-- Check current policies on user_roles table
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;

-- Check if RLS is enabled on user_roles
SELECT 
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'user_roles';

-- Test query to verify admins can query user_roles
-- This should work after applying the migration
SELECT COUNT(*) FROM user_roles WHERE role_type = 'admin';