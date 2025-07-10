-- Clean up duplicate policies on schools table
BEGIN;

-- Drop the OLD policies (these are the ones we wanted to replace)
DROP POLICY IF EXISTS "schools_admin_all" ON schools;
DROP POLICY IF EXISTS "schools_authenticated_view" ON schools;

COMMIT;

-- Verify we now have exactly 2 policies
SELECT policyname, cmd, roles, permissive
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY policyname;