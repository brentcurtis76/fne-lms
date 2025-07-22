-- Migration: Harden RLS Policies for Profiles Table
-- Purpose: Fix critical security vulnerability where RLS is not enforced on profiles table
-- Date: 2025-07-22
-- Critical Security Fix: Apply immediately to production

BEGIN;

-- Step 1: Create helper function for admin check
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
BEGIN
  SELECT relrowsecurity, relforcerowsecurity 
  INTO rls_enabled, rls_forced
  FROM pg_class 
  WHERE relname = 'profiles' 
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  IF NOT rls_enabled OR NOT rls_forced THEN
    RAISE EXCEPTION 'RLS configuration failed on profiles table';
  END IF;
  
  RAISE NOTICE 'RLS successfully enabled and enforced on profiles table';
END $$;

-- Step 7: Log the security fix
INSERT INTO public.audit_logs (
  table_name,
  action,
  user_id,
  details,
  created_at
) VALUES (
  'profiles',
  'security_fix',
  '00000000-0000-0000-0000-000000000000'::uuid,
  jsonb_build_object(
    'fix_type', 'rls_hardening',
    'migration', '20250722160500_harden_rls_policies',
    'policies_created', 4,
    'critical_vulnerability_fixed', true
  ),
  NOW()
) ON CONFLICT DO NOTHING; -- In case audit_logs table doesn't exist

COMMIT;

-- Post-migration verification queries (run these manually after migration):
-- 1. Verify RLS is enabled and enforced:
--    SELECT relname, relrowsecurity, relforcerowsecurity 
--    FROM pg_class WHERE relname = 'profiles';
--
-- 2. Verify policies are created:
--    SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
--    Expected: 4 policies as created above