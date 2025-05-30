-- Complete the boletas bucket RLS policies
-- Run these remaining policies in Supabase SQL Editor

-- Policy 3: Admin Update (UPDATE)
CREATE POLICY "Admin can update boletas bucket"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Policy 4: Admin Delete (DELETE)
CREATE POLICY "Admin can delete from boletas bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Ensure boletas bucket exists with proper configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('boletas', 'boletas', false, 52428800, ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain'];