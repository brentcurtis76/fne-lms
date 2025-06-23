-- Storage policies for post-media bucket
-- Run this in Supabase SQL Editor after creating the bucket

-- 1. Allow authenticated users to upload images
CREATE POLICY "Users can upload post images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'post-media' 
    AND auth.role() = 'authenticated'
);

-- 2. Allow public to view images (for sharing)
CREATE POLICY "Public can view post images"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-media');

-- 3. Allow users to update their own images
CREATE POLICY "Users can update own post images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'post-media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Allow users to delete their own images
CREATE POLICY "Users can delete own post images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'post-media' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Verify policies were created
SELECT * FROM storage.policies WHERE bucket_id = 'post-media';