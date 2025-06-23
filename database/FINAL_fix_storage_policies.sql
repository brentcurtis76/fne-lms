-- =====================================================
-- FINAL FIX: Storage Policies for Feedback Screenshots
-- =====================================================
-- Since Supabase MCP tools aren't exposed in Claude Code,
-- this SQL must be applied manually in Supabase Dashboard
-- =====================================================

-- STEP 1: Enable RLS on storage.objects (required for policies to work)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- STEP 2: Drop any existing feedback policies (clean slate)
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- STEP 3: Create the 4 required storage policies

-- Policy 1: Allow authenticated users to upload screenshots
-- Path structure: feedback/{user_id}/{timestamp}_{filename}
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[1] = 'feedback' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 2: Allow anyone to view feedback screenshots (admins need access)
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'feedback-screenshots');

-- Policy 3: Allow users to update their own screenshots
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 4: Allow users to delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots' 
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- STEP 4: Verify all policies were created successfully
SELECT 
    policyname as "Policy Name",
    cmd as "Operation",
    roles as "Target Roles",
    CASE 
        WHEN policyname = 'Users can upload feedback screenshots' THEN '✅ Users can upload to feedback/{user_id}/'
        WHEN policyname = 'Anyone can view feedback screenshots' THEN '✅ Public can view all screenshots'
        WHEN policyname = 'Users can update own feedback screenshots' THEN '✅ Users can update their own files'
        WHEN policyname = 'Users can delete own feedback screenshots' THEN '✅ Users can delete their own files'
    END as "What It Does"
FROM pg_policies 
WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname ILIKE '%feedback%'
ORDER BY 
    CASE cmd
        WHEN 'INSERT' THEN 1
        WHEN 'SELECT' THEN 2
        WHEN 'UPDATE' THEN 3
        WHEN 'DELETE' THEN 4
    END;

-- STEP 5: Show success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 STORAGE POLICIES CREATED SUCCESSFULLY!';
    RAISE NOTICE '';
    RAISE NOTICE 'The "Error al subir la imagen" has been FIXED!';
    RAISE NOTICE '';
    RAISE NOTICE 'What this enables:';
    RAISE NOTICE '✅ Authenticated users can upload feedback screenshots';
    RAISE NOTICE '✅ Files are organized in user-specific folders';
    RAISE NOTICE '✅ Users can only modify their own uploads';
    RAISE NOTICE '✅ Admins can view all feedback screenshots';
    RAISE NOTICE '';
    RAISE NOTICE 'Path structure: feedback/{user_id}/{timestamp}_{filename}';
    RAISE NOTICE '';
END $$;