-- Fix infinite recursion in group_assignment_members RLS policy
-- This migration creates a SECURITY DEFINER helper function to check group membership
-- without triggering recursive policy evaluation

-- Drop the existing recursive policy
DROP POLICY IF EXISTS "Users can view group members" ON public.group_assignment_members;

-- Create a security definer helper function to check if a user is in a group
-- This function bypasses RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.user_is_in_group(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Check if the user is a member of the specified group
  RETURN EXISTS (
    SELECT 1
    FROM public.group_assignment_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_is_in_group(UUID, UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.user_is_in_group(UUID, UUID) IS
  'Security definer function to check group membership without triggering RLS recursion. Returns TRUE if the specified user is a member of the specified group.';

-- Recreate the policy using the helper function (no more recursion!)
CREATE POLICY "Users can view group members" ON public.group_assignment_members
  FOR SELECT
  USING (
    -- Users can see their own membership records
    (user_id = auth.uid())
    OR
    -- Users can see other members in groups they belong to
    public.user_is_in_group(group_id, auth.uid())
  );
