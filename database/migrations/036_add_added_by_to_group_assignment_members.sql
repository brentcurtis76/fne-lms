-- Migration 036: Add added_by column to group_assignment_members
-- This allows tracking who invited each member to the group (for student-initiated invitations)

-- Add the added_by column
ALTER TABLE group_assignment_members
ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES auth.users(id);

-- Add comment
COMMENT ON COLUMN group_assignment_members.added_by IS 'User who added this member to the group (for student-invited members)';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_added_by
  ON group_assignment_members(added_by)
  WHERE added_by IS NOT NULL;

-- Update RLS policies to be more restrictive
-- Since we now have server-side API validation, we restrict client-side inserts
-- First, drop the existing insert policy if it exists
DROP POLICY IF EXISTS "Users can join groups" ON group_assignment_members;

-- Restrictive policy:
-- 1. Users can ONLY add themselves (self-join to create their own group)
-- 2. All other inserts (including classmate invitations) must go through API routes
-- 3. Consultants can still add students (for consultant-managed groups)
CREATE POLICY "Users can only self-join groups"
  ON group_assignment_members
  FOR INSERT
  WITH CHECK (
    -- User can ONLY add themselves
    auth.uid() = user_id
    OR
    -- Consultants can add students to groups they manage
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type IN ('consultor', 'admin')
      AND is_active = true
    )
  );

-- Add policy for viewing added_by information
DROP POLICY IF EXISTS "Users can view group members" ON group_assignment_members;

CREATE POLICY "Users can view group members including who added them"
  ON group_assignment_members
  FOR SELECT
  USING (
    -- Users can see members of their own groups
    EXISTS (
      SELECT 1 FROM group_assignment_members AS my_membership
      WHERE my_membership.group_id = group_assignment_members.group_id
      AND my_membership.user_id = auth.uid()
    )
    OR
    -- Consultants can see all group members
    EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type IN ('consultor', 'admin')
      AND is_active = true
    )
  );
