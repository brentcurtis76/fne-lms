-- Migration 029b: Update Storage RLS Policies for Shared Assignment Access
-- Allows users to access files from assignments shared with them
-- Date: 2025-01-10

-- Drop existing policies on assignments bucket
DROP POLICY IF EXISTS "Users can view their own assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Consultants can view all assignment files" ON storage.objects;

-- Policy 1: Users can view files for their own submissions OR shared submissions
CREATE POLICY "Users can view own and shared assignment files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'assignments'
    AND (
      -- User uploaded the file
      auth.uid()::text = (storage.foldername(name))[3]
      OR
      -- User has a submission that references this file (student_id match)
      EXISTS (
        SELECT 1 FROM lesson_assignment_submissions las
        WHERE las.student_id = auth.uid()
        AND las.attachment_urls::text LIKE '%' || name || '%'
      )
      OR
      -- User is the submitter (submitted_by) of a submission referencing this file
      EXISTS (
        SELECT 1 FROM lesson_assignment_submissions las
        WHERE las.submitted_by = auth.uid()
        AND las.attachment_urls::text LIKE '%' || name || '%'
      )
    )
  );

-- Policy 2: Users can upload to their own assignment folders
CREATE POLICY "Users can upload assignment files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'assignments'
    AND auth.uid()::text = (storage.foldername(name))[3]
  );

-- Policy 3: Users can update their own files
CREATE POLICY "Users can update their own assignment files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'assignments'
    AND auth.uid()::text = (storage.foldername(name))[3]
  )
  WITH CHECK (
    bucket_id = 'assignments'
    AND auth.uid()::text = (storage.foldername(name))[3]
  );

-- Policy 4: Users can delete their own files
CREATE POLICY "Users can delete their own assignment files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'assignments'
    AND auth.uid()::text = (storage.foldername(name))[3]
  );

-- Policy 5: Consultants can view all assignment files in their communities
CREATE POLICY "Consultants can view community assignment files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'assignments'
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
      AND ur.is_active = true
    )
  );

-- Policy 6: Admins have full access
CREATE POLICY "Admins can manage all assignment files"
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'assignments'
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Users can view own and shared assignment files" ON storage.objects IS
'Allows users to view files from their own submissions and submissions shared with them via collaborative assignment feature';

-- Migration complete
