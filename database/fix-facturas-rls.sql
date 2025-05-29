-- Fix RLS policies for facturas bucket to allow invoice uploads

-- First, ensure RLS is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing facturas policies if they exist
DROP POLICY IF EXISTS facturas_view_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_upload_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_update_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_delete_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_all_authenticated ON storage.objects;

-- Create a comprehensive policy for all operations on facturas bucket
-- This allows authenticated users to do all operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "facturas_all_authenticated" ON storage.objects
FOR ALL 
USING (
    bucket_id = 'facturas' 
    AND auth.role() = 'authenticated'
)
WITH CHECK (
    bucket_id = 'facturas' 
    AND auth.role() = 'authenticated'
);

-- Verify the bucket exists and is properly configured
SELECT 
    id, 
    name, 
    public, 
    created_at 
FROM storage.buckets 
WHERE id = 'facturas';

-- Show current policies for verification
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
    AND policyname LIKE '%facturas%';

COMMENT ON POLICY facturas_all_authenticated ON storage.objects IS 'Allow all operations on facturas bucket for authenticated users';