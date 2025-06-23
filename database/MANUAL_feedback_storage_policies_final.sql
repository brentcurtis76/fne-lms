-- MANUAL EXECUTION REQUIRED IN SUPABASE DASHBOARD
-- Copy and paste this SQL into the Supabase Dashboard SQL Editor
-- Navigate to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new

-- Step 1: Ensure RLS is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing feedback policies if they exist
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- Step 3: Create the 4 required storage policies

-- 1. Upload Policy - Allow authenticated users to upload feedback screenshots
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[1] = 'feedback' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 2. View Policy - Allow anyone to view feedback screenshots
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'feedback-screenshots');

-- 3. Update Policy - Allow users to update their own feedback screenshots
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 4. Delete Policy - Allow users to delete their own feedback screenshots
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Step 4: Verify policies were created successfully
SELECT 
    policyname as name,
    cmd as operation,
    roles,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies 
WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname ILIKE '%feedback%'
ORDER BY policyname;