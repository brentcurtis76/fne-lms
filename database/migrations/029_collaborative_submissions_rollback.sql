-- Rollback Migration 029: Remove Collaborative Submission Support
-- Use this if migration 029 needs to be rolled back
-- Date: 2025-01-10

-- Step 1: Drop triggers
DROP TRIGGER IF EXISTS trigger_cascade_submission_updates ON group_assignment_submissions;
DROP TRIGGER IF EXISTS trigger_update_submission_timestamp ON group_assignment_submissions;

-- Step 2: Drop functions
DROP FUNCTION IF EXISTS cascade_submission_updates();
DROP FUNCTION IF EXISTS update_submission_updated_at();

-- Step 3: Drop policies on assignment_submission_shares
DROP POLICY IF EXISTS "Users can view their shares" ON assignment_submission_shares;
DROP POLICY IF EXISTS "Service role can create shares" ON assignment_submission_shares;
DROP POLICY IF EXISTS "Consultants can view community shares" ON assignment_submission_shares;

-- Step 4: Drop indexes
DROP INDEX IF EXISTS idx_submissions_source_id;
DROP INDEX IF EXISTS idx_submissions_submitted_by;
DROP INDEX IF EXISTS idx_submission_shares_user;
DROP INDEX IF EXISTS idx_submission_shares_source;

-- Step 5: Drop audit table
DROP TABLE IF EXISTS assignment_submission_shares;

-- Step 6: Remove new columns from group_assignment_submissions
ALTER TABLE group_assignment_submissions
  DROP COLUMN IF EXISTS submitted_by,
  DROP COLUMN IF EXISTS source_submission_id,
  DROP COLUMN IF EXISTS is_original,
  DROP COLUMN IF EXISTS updated_at;

-- Step 7: Restore original RLS policies (simplified version)
DROP POLICY IF EXISTS "Users can view own and shared submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "Users can create submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "Original submitters can update" ON group_assignment_submissions;
DROP POLICY IF EXISTS "Consultants can view community submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "Admins can manage all submissions" ON group_assignment_submissions;

-- Recreate basic policies
CREATE POLICY "Users can view their own submissions"
  ON group_assignment_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own submissions"
  ON group_assignment_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own submissions"
  ON group_assignment_submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Consultants can view all submissions"
  ON group_assignment_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
    )
  );

CREATE POLICY "Admins can do everything"
  ON group_assignment_submissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
    )
  );

-- Rollback complete
