-- ==============================================================================
-- FIX: Migration 029 RLS Policy Infinite Recursion
-- ==============================================================================
-- Fixes infinite recursion error in assignment_submission_shares policies
-- that was caused by circular dependency between tables
-- ==============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view their shares" ON assignment_submission_shares;

-- Recreate without the circular reference to lesson_assignment_submissions
-- This prevents infinite recursion when querying submissions
CREATE POLICY "Users can view their shares"
  ON assignment_submission_shares
  FOR SELECT
  USING (
    -- Users can only view shares where they are the recipient
    -- We removed the submitted_by check to avoid recursion
    shared_with_user_id = auth.uid()
  );

-- Verify the fix
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'assignment_submission_shares'
AND policyname = 'Users can view their shares';

-- ==============================================================================
-- EXPECTED OUTPUT:
-- tablename: assignment_submission_shares
-- policyname: Users can view their shares
-- qual: (shared_with_user_id = auth.uid())
-- ==============================================================================
