-- Phase 0: Add no-arg wrapper for auth_is_superadmin
-- This migration adds a convenience wrapper that uses the current user's ID
-- Safe and idempotent

-- Create no-arg wrapper function that uses auth.uid()
CREATE OR REPLACE FUNCTION auth_is_superadmin() 
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER 
SET search_path = public
AS $$
  SELECT auth_is_superadmin(auth.uid());
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION auth_is_superadmin() TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION auth_is_superadmin() IS 'Check if the current authenticated user is a superadmin';