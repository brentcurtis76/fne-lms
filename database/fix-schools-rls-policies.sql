-- Fix Schools RLS Policies
-- This script resolves the duplicate RLS policy issue on the schools table
-- Date: 2025-01-10

BEGIN;

-- Drop all existing policies on schools table
DROP POLICY IF EXISTS "Admin can do everything with schools" ON schools CASCADE;
DROP POLICY IF EXISTS "Users can view schools" ON schools CASCADE;
DROP POLICY IF EXISTS "Admin full access to schools" ON schools CASCADE;
DROP POLICY IF EXISTS "Public read access to schools" ON schools CASCADE;
DROP POLICY IF EXISTS "Authenticated users can view schools" ON schools CASCADE;
DROP POLICY IF EXISTS "Admin full access" ON schools CASCADE;

-- Create new policy: All authenticated users can read schools
CREATE POLICY "authenticated_users_read_schools" 
ON schools
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create new policy: Admins have full access
CREATE POLICY "admin_full_access_schools"
ON schools
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

COMMIT;

-- Verify the policies after creation
SELECT 
  policyname,
  cmd,
  roles,
  permissive,
  qual::text as using_expression
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY policyname;