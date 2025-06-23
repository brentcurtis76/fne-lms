-- Setup storage policies for feedback-screenshots bucket
-- This file creates the necessary RLS policies for the feedback-screenshots storage bucket

-- Ensure RLS is enabled on storage.objects table (may require superuser privileges)
-- This is typically already enabled in Supabase projects
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any existing feedback screenshot policies to avoid conflicts
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- Policy 1: Allow authenticated users to upload feedback screenshots to their own folder
-- Path structure: feedback/{user_id}/filename.ext
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[1] = 'feedback' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 2: Allow anyone to view feedback screenshots (public read access)
-- This enables displaying screenshots in the feedback interface
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'feedback-screenshots');

-- Policy 3: Allow users to update their own feedback screenshots
-- Users can only modify files in their own folder
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 4: Allow users to delete their own feedback screenshots
-- Users can only delete files in their own folder
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Verify policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND policyname LIKE '%feedback%'
ORDER BY policyname;