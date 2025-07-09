-- Storage bucket RLS policies for meeting-documents
-- Run this in Supabase SQL Editor after creating the bucket

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload meeting documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'meeting-documents'
);

-- Allow authenticated users to view all files in the bucket
CREATE POLICY "Authenticated users can view meeting documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'meeting-documents'
);

-- Allow users to update their own files
CREATE POLICY "Users can update their own meeting documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'meeting-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
    bucket_id = 'meeting-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own meeting documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'meeting-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Alternative: If you want public read access (no authentication required)
-- Uncomment the following and comment out the authenticated SELECT policy above
/*
CREATE POLICY "Public can view meeting documents"
ON storage.objects FOR SELECT
TO public
USING (
    bucket_id = 'meeting-documents'
);
*/