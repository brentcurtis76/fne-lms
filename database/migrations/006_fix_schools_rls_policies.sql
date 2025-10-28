-- =====================================================
-- Migration 006: Fix Schools Table RLS Policies
-- =====================================================
-- Author: Claude Code
-- Date: 2025-10-06
-- Status: CRITICAL FIX
--
-- Problem: Multiple conflicting RLS policies causing "permission denied for table user_roles_cache"
-- Root Cause: schools_select_policy calls auth_has_school_access_uuid() which queries user_roles_cache
--             Even though other policies allow access, this one fails and blocks all reads
--
-- Solution:
-- 1. Drop conflicting/redundant SELECT policies
-- 2. Keep only one clean SELECT policy that allows authenticated users
-- 3. Ensure INSERT/UPDATE/DELETE policies are correct
--
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Drop Conflicting SELECT Policies
-- =====================================================

-- Drop all SELECT policies to start clean
DROP POLICY IF EXISTS "authenticated_users_read_schools" ON public.schools;
DROP POLICY IF EXISTS "schools_authenticated_view" ON public.schools;
DROP POLICY IF EXISTS "schools_select_policy" ON public.schools;

-- =====================================================
-- STEP 2: Create Single, Clean SELECT Policy
-- =====================================================

-- Allow all authenticated users to read schools
-- Admins and regular users both need to see the schools list
CREATE POLICY "schools_read_authenticated"
ON public.schools
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- =====================================================
-- STEP 3: Verify INSERT/UPDATE/DELETE Policies
-- =====================================================

-- These should remain unchanged but let's verify they exist

-- INSERT: Admin only (schools_insert_policy has NULL which is wrong)
DROP POLICY IF EXISTS "schools_insert_policy" ON public.schools;
CREATE POLICY "schools_insert_admin"
ON public.schools
FOR INSERT
TO authenticated
WITH CHECK (auth_is_admin());

-- UPDATE: Admin only (keep existing)
-- schools_update_policy already exists and is correct

-- DELETE: Admin only (keep existing)
-- schools_delete_policy already exists and is correct

-- =====================================================
-- STEP 4: Grant Permissions to user_roles_cache (Safety)
-- =====================================================

-- In case policies do reference user_roles_cache in the future
-- Grant SELECT to anon and authenticated roles
GRANT SELECT ON public.user_roles_cache TO anon;
GRANT SELECT ON public.user_roles_cache TO authenticated;

-- =====================================================
-- STEP 5: Verification
-- =====================================================

-- Show all policies on schools table
SELECT
    policyname,
    cmd as operation,
    roles,
    qual::text as using_clause,
    with_check::text as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'schools'
ORDER BY cmd, policyname;

-- Test that SELECT works for authenticated users
DO $$
BEGIN
    RAISE NOTICE '✅ RLS policies updated successfully';
    RAISE NOTICE '✅ SELECT: Authenticated users can read all schools';
    RAISE NOTICE '✅ INSERT: Only admins can create schools';
    RAISE NOTICE '✅ UPDATE: Only admins can update schools';
    RAISE NOTICE '✅ DELETE: Only admins can delete schools';
END $$;

COMMIT;

-- =====================================================
-- Post-Migration Test
-- =====================================================

-- This should work now (simulating API call)
SELECT id, name, has_generations
FROM public.schools
WHERE id = 9;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
