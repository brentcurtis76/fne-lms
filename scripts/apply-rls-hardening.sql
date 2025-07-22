-- CRITICAL SECURITY FIX: Apply RLS Hardening to Profiles Table
-- Run this script directly in Supabase SQL Editor
-- Date: 2025-07-22

-- Note: This script is idempotent and can be run multiple times safely

BEGIN;

-- Step 1: Create or replace helper function for admin check
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = auth.uid() 
      AND role_type = 'admin' 
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Drop all existing RLS policies on profiles table
-- This ensures a clean slate and prevents conflicts
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'profiles' 
      AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- Step 3: Enable and enforce RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

-- Step 4: Create new secure RLS policies

-- Policy 1: Users can view their own profile
CREATE POLICY "Allow users to view their own profile" ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id OR is_admin()
  );

-- Policy 2: Users can insert their own profile
CREATE POLICY "Allow users to insert their own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id OR is_admin()
  );

-- Policy 3: Users can update their own profile
CREATE POLICY "Allow users to update their own profile" ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id OR is_admin()
  )
  WITH CHECK (
    auth.uid() = id OR is_admin()
  );

-- Policy 4: Allow admin full access on profiles
CREATE POLICY "Allow admin full access on profiles" ON public.profiles
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Step 5: Add comment explaining the security model
COMMENT ON TABLE public.profiles IS 'User profiles table with strict RLS enforcement. Users can only access their own profile unless they are admins.';

-- Step 6: Verify RLS is properly configured
DO $$
DECLARE
  rls_enabled boolean;
  rls_forced boolean;
  policy_count integer;
BEGIN
  -- Check RLS status
  SELECT relrowsecurity, relforcerowsecurity 
  INTO rls_enabled, rls_forced
  FROM pg_class 
  WHERE relname = 'profiles' 
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  -- Count policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE tablename = 'profiles';
  
  -- Verify configuration
  IF NOT rls_enabled OR NOT rls_forced THEN
    RAISE EXCEPTION 'RLS configuration failed on profiles table';
  END IF;
  
  IF policy_count != 4 THEN
    RAISE EXCEPTION 'Expected 4 policies but found %', policy_count;
  END IF;
  
  RAISE NOTICE 'RLS successfully enabled and enforced on profiles table with % policies', policy_count;
END $$;

COMMIT;

-- VERIFICATION QUERIES - Run these after the script completes:

-- Query 1: Confirm RLS is enabled and enforced
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'profiles';
-- Expected: Both values should be 't' (true)

-- Query 2: Confirm the new policies are active
SELECT policyname FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname;
-- Expected: 4 policies as listed below:
-- - Allow admin full access on profiles
-- - Allow users to insert their own profile
-- - Allow users to update their own profile
-- - Allow users to view their own profile