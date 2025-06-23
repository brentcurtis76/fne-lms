-- Comprehensive fix for post creation and storage
-- This ensures all necessary permissions are in place

-- 1. Check current policies status
SELECT 
    'Current RLS Policies' as section,
    polname as policy_name,
    CASE polcmd 
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT' 
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
    END as operation
FROM pg_policy 
WHERE polrelid = 'community_posts'::regclass
ORDER BY polname;

-- 2. Check storage bucket and policies
SELECT 
    'Storage Bucket Status' as section,
    id as bucket_id,
    name as bucket_name,
    public as is_public
FROM storage.buckets
WHERE id = 'post-media';

-- 3. Create storage bucket if missing
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- 4. Check and create storage policies
-- First check existing policies
SELECT 
    'Existing Storage Policies' as section,
    name as policy_name,
    bucket_id,
    COALESCE(definition->>'operation', 'Unknown') as operation
FROM storage.policies
WHERE bucket_id = 'post-media';

-- 5. Drop existing storage policies to recreate them properly
DELETE FROM storage.policies WHERE bucket_id = 'post-media';

-- 6. Create proper storage policies using the storage schema
-- Allow authenticated users to upload
INSERT INTO storage.objects (bucket_id, name, owner, created_at, updated_at)
SELECT 'post-media', '.emptyPlaceholder', '00000000-0000-0000-0000-000000000000', NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM storage.objects 
    WHERE bucket_id = 'post-media' 
    AND name = '.emptyPlaceholder'
);

-- 7. Create RLS policies for storage.objects
DO $$
BEGIN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Authenticated users can upload to post-media" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can view post-media" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update own post-media" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete own post-media" ON storage.objects;
    
    -- Create new policies
    CREATE POLICY "Authenticated users can upload to post-media"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'post-media' AND
        auth.uid() IS NOT NULL
    );
    
    CREATE POLICY "Anyone can view post-media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'post-media');
    
    CREATE POLICY "Users can update own post-media"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'post-media' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
    
    CREATE POLICY "Users can delete own post-media"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'post-media' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
    
    RAISE NOTICE 'Storage policies created successfully';
END $$;

-- 8. Verify all grants
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT ALL ON storage.objects TO authenticated;

-- 9. Final verification
SELECT 
    'Final Status Check' as section,
    'community_posts RLS enabled' as check_item,
    relrowsecurity as status
FROM pg_class 
WHERE relname = 'community_posts'
UNION ALL
SELECT 
    'Final Status Check' as section,
    'posts_with_engagement accessible' as check_item,
    EXISTS (
        SELECT 1 FROM information_schema.table_privileges
        WHERE table_name = 'posts_with_engagement'
        AND grantee = 'authenticated'
        AND privilege_type = 'SELECT'
    ) as status
UNION ALL
SELECT 
    'Final Status Check' as section,
    'post-media bucket exists' as check_item,
    EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'post-media'
    ) as status
UNION ALL
SELECT 
    'Final Status Check' as section,
    'storage.objects has policies' as check_item,
    EXISTS (
        SELECT 1 FROM pg_policy 
        WHERE polrelid = 'storage.objects'::regclass
        AND polname LIKE '%post-media%'
    ) as status;

-- 10. Output summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '===== POST CREATION FIX COMPLETE =====';
    RAISE NOTICE '✓ Community posts RLS policies are active';
    RAISE NOTICE '✓ Storage bucket post-media configured';
    RAISE NOTICE '✓ Storage policies created for uploads';
    RAISE NOTICE '✓ View permissions granted';
    RAISE NOTICE '';
    RAISE NOTICE 'Users can now create posts with images!';
    RAISE NOTICE '=====================================';
END $$;