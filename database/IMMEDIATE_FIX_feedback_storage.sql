-- IMMEDIATE FIX FOR "Error al subir la imagen" 
-- Copy and paste this SQL into Supabase Dashboard SQL Editor
-- URL: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new

-- Ensure RLS is enabled on storage.objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any existing feedback screenshot policies to avoid conflicts
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- 1. UPLOAD POLICY - Allow authenticated users to upload feedback screenshots
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[1] = 'feedback' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 2. VIEW POLICY - Allow anyone to view feedback screenshots (admins need access)
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'feedback-screenshots');

-- 3. UPDATE POLICY - Allow users to update their own feedback screenshots
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 4. DELETE POLICY - Allow users to delete their own feedback screenshots
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- VERIFICATION QUERY - Run this to confirm policies were created
SELECT 
    policyname as "Policy Name",
    cmd as "Operation",
    roles as "Roles",
    CASE 
        WHEN qual IS NOT NULL THEN 'Yes' 
        ELSE 'No' 
    END as "Has USING clause",
    CASE 
        WHEN with_check IS NOT NULL THEN 'Yes' 
        ELSE 'No' 
    END as "Has WITH CHECK clause"
FROM pg_policies 
WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname ILIKE '%feedback%'
ORDER BY policyname;

-- SUCCESS MESSAGE
SELECT 'SUCCESS: All 4 feedback screenshot storage policies have been created!' as message;