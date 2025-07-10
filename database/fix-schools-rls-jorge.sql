-- Fix schools table RLS for Jorge Parra
-- This script fixes the issue where authenticated users can't see schools
-- Date: 2025-01-10

BEGIN;

-- 1. Drop all existing policies on schools table
DROP POLICY IF EXISTS "Admin can do everything with schools" ON schools;
DROP POLICY IF EXISTS "Users can view schools" ON schools;
DROP POLICY IF EXISTS "Admin full access to schools" ON schools;
DROP POLICY IF EXISTS "Public read access to schools" ON schools;
DROP POLICY IF EXISTS "Authenticated users can view schools" ON schools;
DROP POLICY IF EXISTS "Admin full access" ON schools;
DROP POLICY IF EXISTS "schools_select_authenticated" ON schools;
DROP POLICY IF EXISTS "schools_admin_all" ON schools;

-- 2. Create new policy: All authenticated users can read schools
CREATE POLICY "authenticated_users_read_schools" 
ON schools
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 3. Create new policy: Admins have full access
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
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

COMMIT;

-- Verification query - run this after applying the fix:
-- SELECT policyname, cmd, permissive
-- FROM pg_policies 
-- WHERE tablename = 'schools'
-- ORDER BY policyname;