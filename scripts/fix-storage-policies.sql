-- Fix storage bucket policies for image uploads
-- This allows users to upload, view, and manage files in the 'resources' bucket

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow public uploads to resources bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from resources bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from resources bucket" ON storage.objects;

-- Policy to allow anyone to upload files to resources bucket
CREATE POLICY "Allow public uploads to resources bucket"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'resources');

-- Policy to allow anyone to view files in resources bucket
CREATE POLICY "Allow public reads from resources bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resources');

-- Policy to allow anyone to delete files in resources bucket
CREATE POLICY "Allow public deletes from resources bucket"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'resources');

-- Policy to allow anyone to update files in resources bucket
CREATE POLICY "Allow public updates to resources bucket"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'resources')
WITH CHECK (bucket_id = 'resources');

-- Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resources', 'resources', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];