-- ===============================================
-- URGENT: Fix Storage Policies for Feedback Screenshots
-- ===============================================
-- This MUST be run in Supabase Dashboard SQL Editor
-- The upload error is caused by missing storage policies
-- ===============================================

-- Step 1: Ensure storage policies are enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing conflicting policies
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- Step 3: Create storage policies for feedback-screenshots bucket

-- Policy 1: Allow authenticated users to upload their own screenshots
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'feedback-screenshots' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = 'feedback' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 2: Allow anyone to view feedback screenshots (for admin review)
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'feedback-screenshots');

-- Policy 3: Allow users to update their own screenshots
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'feedback-screenshots' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 4: Allow users to delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'feedback-screenshots' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Step 4: Verify policies were created
SELECT 
  policyname,
  cmd as permission_type,
  CASE 
    WHEN cmd = 'SELECT' THEN '📖 Read'
    WHEN cmd = 'INSERT' THEN '➕ Upload'
    WHEN cmd = 'UPDATE' THEN '✏️ Update'
    WHEN cmd = 'DELETE' THEN '🗑️ Delete'
    ELSE cmd
  END as description
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%feedback%'
ORDER BY cmd;

-- Step 5: Show success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🎉 STORAGE POLICIES CREATED SUCCESSFULLY!';
  RAISE NOTICE '';
  RAISE NOTICE 'The "Error al subir la imagen" should now be fixed.';
  RAISE NOTICE 'Users can now upload screenshots to the feedback system.';
  RAISE NOTICE '';
  RAISE NOTICE 'Path structure: feedback/{user_id}/{timestamp}_{filename}';
  RAISE NOTICE '';
END $$;