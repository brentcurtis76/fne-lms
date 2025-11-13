-- Migration 029: Add Collaborative Submission Support to lesson_assignment_submissions
-- This migration adds the ability for users to submit assignments on behalf of multiple community members
-- Date: 2025-01-10
-- FIXED: Now targets lesson_assignment_submissions (the correct table)

-- Step 1: Add new columns to lesson_assignment_submissions
-- Note: submitted_by references profiles(id) for PostgREST auto-join support
ALTER TABLE lesson_assignment_submissions
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS source_submission_id uuid REFERENCES lesson_assignment_submissions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_original boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add foreign key constraint for submitted_by -> profiles(id) (for PostgREST joins)
-- Drop existing constraint if it references auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_assignment_submissions_submitted_by_fkey'
    AND table_name = 'lesson_assignment_submissions'
  ) THEN
    ALTER TABLE lesson_assignment_submissions
      DROP CONSTRAINT lesson_assignment_submissions_submitted_by_fkey;
  END IF;
END $$;

-- Add new constraint referencing profiles
ALTER TABLE lesson_assignment_submissions
  ADD CONSTRAINT lesson_assignment_submissions_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- Step 2: Backfill existing data
-- For all existing submissions, set submitted_by to student_id and mark as original
UPDATE lesson_assignment_submissions
SET
  submitted_by = student_id,
  is_original = true,
  source_submission_id = null,
  updated_at = COALESCE(updated_at, submitted_at, now())
WHERE submitted_by IS NULL;

-- Step 3: Make submitted_by NOT NULL after backfill
ALTER TABLE lesson_assignment_submissions
  ALTER COLUMN submitted_by SET NOT NULL;

-- Step 4: Create audit table for tracking shares
CREATE TABLE IF NOT EXISTS assignment_submission_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_submission_id uuid NOT NULL REFERENCES lesson_assignment_submissions(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id uuid REFERENCES growth_communities(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_submission_id, shared_with_user_id)
);

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_submissions_source_id ON lesson_assignment_submissions(source_submission_id);
CREATE INDEX IF NOT EXISTS idx_lesson_submissions_submitted_by ON lesson_assignment_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_lesson_submissions_student_id ON lesson_assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submission_shares_user ON assignment_submission_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_submission_shares_source ON assignment_submission_shares(source_submission_id);

-- Step 6: Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lesson_submission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lesson_submission_timestamp ON lesson_assignment_submissions;
CREATE TRIGGER trigger_update_lesson_submission_timestamp
  BEFORE UPDATE ON lesson_assignment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_lesson_submission_updated_at();

-- Step 7: Update RLS policies for lesson_assignment_submissions
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Users can insert their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Users can update their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Teachers can view submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Admins can manage submissions" ON lesson_assignment_submissions;

-- Recreate policies with collaborative submission support
-- Policy 1: Users can view submissions where they are the student OR submitted_by them OR shared with them
CREATE POLICY "Users can view own and shared submissions"
  ON lesson_assignment_submissions
  FOR SELECT
  USING (
    auth.uid() = student_id
    OR auth.uid() = submitted_by
    OR EXISTS (
      SELECT 1 FROM assignment_submission_shares ass
      WHERE ass.source_submission_id = lesson_assignment_submissions.id
      AND ass.shared_with_user_id = auth.uid()
    )
  );

-- Policy 2: Users can insert submissions for themselves or on behalf of others (handled by service layer validation)
CREATE POLICY "Users can create submissions"
  ON lesson_assignment_submissions
  FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
  );

-- Policy 3: Only original submitter can update their submission
CREATE POLICY "Original submitters can update"
  ON lesson_assignment_submissions
  FOR UPDATE
  USING (
    auth.uid() = submitted_by
    AND is_original = true
  )
  WITH CHECK (
    auth.uid() = submitted_by
    AND is_original = true
  );

-- Policy 4: Teachers/Consultants can view submissions in their courses
CREATE POLICY "Teachers can view course submissions"
  ON lesson_assignment_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lesson_assignments la
      WHERE la.id = lesson_assignment_submissions.assignment_id
      AND auth_is_course_teacher(la.course_id)
    )
  );

-- Policy 5: Admins have full access
CREATE POLICY "Admins can manage all submissions"
  ON lesson_assignment_submissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
    )
  );

-- Step 8: Add RLS policies for assignment_submission_shares
ALTER TABLE assignment_submission_shares ENABLE ROW LEVEL SECURITY;

-- Users can view shares where they are the recipient
-- NOTE: We cannot check submitted_by here as it would cause infinite recursion
-- The main submissions table policy handles access control for submitters
CREATE POLICY "Users can view their shares"
  ON assignment_submission_shares
  FOR SELECT
  USING (
    shared_with_user_id = auth.uid()
  );

-- Service role can insert shares (handled via API)
CREATE POLICY "Service role can create shares"
  ON assignment_submission_shares
  FOR INSERT
  WITH CHECK (true);

-- Teachers and admins can view all shares
CREATE POLICY "Teachers can view shares"
  ON assignment_submission_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type IN ('consultor', 'admin', 'equipo_directivo', 'lider_generacion')
      AND ur.is_active = true
    )
  );

-- Step 9: Create function to cascade updates to derived submissions
CREATE OR REPLACE FUNCTION cascade_lesson_submission_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- When an original submission is updated, update all derived submissions
  IF NEW.is_original = true AND (
    OLD.content IS DISTINCT FROM NEW.content
    OR OLD.attachment_urls IS DISTINCT FROM NEW.attachment_urls
  ) THEN
    UPDATE lesson_assignment_submissions
    SET
      content = NEW.content,
      attachment_urls = NEW.attachment_urls,
      updated_at = now()
    WHERE source_submission_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cascade_lesson_submission_updates ON lesson_assignment_submissions;
CREATE TRIGGER trigger_cascade_lesson_submission_updates
  AFTER UPDATE ON lesson_assignment_submissions
  FOR EACH ROW
  WHEN (NEW.is_original = true)
  EXECUTE FUNCTION cascade_lesson_submission_updates();

-- Step 10: Add comments for documentation
COMMENT ON COLUMN lesson_assignment_submissions.submitted_by IS 'The user who actually submitted the assignment (original submitter)';
COMMENT ON COLUMN lesson_assignment_submissions.source_submission_id IS 'Reference to the original submission if this is a derived (shared) submission';
COMMENT ON COLUMN lesson_assignment_submissions.is_original IS 'TRUE if this is the original submission, FALSE if derived from a share';
COMMENT ON TABLE assignment_submission_shares IS 'Audit table tracking which users received shared submissions';

-- Migration complete
-- To rollback: Run 029_collaborative_submissions_rollback.sql
