-- Phase 0: Fix recursive RLS policies on superadmins table
-- The existing policies cause infinite recursion by querying superadmins within superadmins policies
-- This migration replaces them with non-recursive versions

BEGIN;

-- Drop existing recursive policies
DROP POLICY IF EXISTS "Superadmins can view all superadmins" ON public.superadmins;
DROP POLICY IF EXISTS "Only superadmins can insert superadmins" ON public.superadmins;
DROP POLICY IF EXISTS "Only superadmins can update superadmins" ON public.superadmins;

-- Create non-recursive SELECT policy
-- Users can only see their own superadmin record when active
CREATE POLICY "Users can view own superadmin status" ON public.superadmins
  FOR SELECT
  USING (user_id = auth.uid() AND is_active = true);

-- For Phase 0, we don't need INSERT/UPDATE policies as no writes are happening
-- These will be added in a future phase when write operations are implemented
-- Keeping the table read-only for now is safer

COMMIT;

-- Note: The auth_is_superadmin() function already exists and doesn't cause recursion
-- because it's a SECURITY DEFINER function that bypasses RLS