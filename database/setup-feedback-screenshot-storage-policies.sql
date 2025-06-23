-- Setup Storage Policies for Feedback Screenshots
-- Run this in your Supabase SQL Editor

-- First, drop any existing policies with the same names to avoid conflicts
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- 1. Upload Policy - Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots' AND 
    (storage.foldername(name))[1] = 'feedback' AND 
    (storage.foldername(name))[2] = auth.uid()::text
);

-- 2. View Policy - Allow anyone to view feedback screenshots (for sharing with admins)
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'feedback-screenshots');

-- 3. Update Policy - Allow users to update their own screenshots
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'feedback-screenshots' AND 
    (storage.foldername(name))[2] = auth.uid()::text
);

-- 4. Delete Policy - Allow users to delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'feedback-screenshots' AND 
    (storage.foldername(name))[2] = auth.uid()::text
);

-- Verify the policies were created successfully
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname LIKE '%feedback screenshots%'
ORDER BY policyname;