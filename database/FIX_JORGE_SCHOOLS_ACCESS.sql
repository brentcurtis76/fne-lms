-- FIX JORGE'S SCHOOLS ACCESS
-- Run this in Supabase SQL Editor to fix the issue immediately

-- PROBLEM: Jorge sees "Escuela de Prueba 1" and "Escuela de Prueba 2" instead of real schools
-- SOLUTION: Create a policy that allows all authenticated users to see schools

-- 1. Create the missing policy
CREATE POLICY authenticated_users_read_schools ON schools
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. Verify the fix worked
SELECT 
  'VERIFICATION RESULTS' as status,
  EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'schools' 
    AND policyname = 'authenticated_users_read_schools'
  ) as policy_created,
  (SELECT COUNT(*) FROM schools) as total_schools,
  (SELECT name FROM schools WHERE name = 'Los Pellines' LIMIT 1) as jorge_school,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'schools' 
      AND policyname = 'authenticated_users_read_schools'
    ) THEN '✅ SUCCESS: Jorge can now see all real schools!'
    ELSE '❌ ERROR: Policy creation failed'
  END as result;

-- Expected output:
-- status               | policy_created | total_schools | jorge_school  | result
-- VERIFICATION RESULTS | true          | [number]      | Los Pellines  | ✅ SUCCESS: Jorge can now see all real schools!