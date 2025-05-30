-- Fix RLS policies for 'boletas' Supabase Storage bucket used for expense report receipts
-- This script ensures admin users can upload, view, and manage receipt files

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing boletas policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "boletas_authenticated_all" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin access to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin uploads to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin reads from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin updates to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin deletes from boletas bucket" ON storage.objects;

-- Policy to allow admin users to upload receipt files to boletas bucket
CREATE POLICY "Allow admin uploads to boletas bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'boletas' 
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
);

-- Policy to allow admin users to view receipt files in boletas bucket
CREATE POLICY "Allow admin reads from boletas bucket"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'boletas' 
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
);

-- Policy to allow admin users to update receipt files in boletas bucket
CREATE POLICY "Allow admin updates to boletas bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'boletas' 
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
)
WITH CHECK (
    bucket_id = 'boletas' 
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
);

-- Policy to allow admin users to delete receipt files from boletas bucket
CREATE POLICY "Allow admin deletes from boletas bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'boletas' 
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
);

-- Ensure the boletas bucket exists with proper configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'boletas', 
    'boletas', 
    false, -- Keep bucket private for security (admin-only access)
    52428800, -- 50MB file size limit
    ARRAY[
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/gif', 
        'image/webp',
        'application/pdf',
        'text/plain'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false, -- Ensure it stays private
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
        'image/jpeg', 
        'image/jpg', 
        'image/png', 
        'image/gif', 
        'image/webp',
        'application/pdf',
        'text/plain'
    ];

-- Add a comment to document the bucket's purpose
COMMENT ON TABLE storage.objects IS 'Storage objects table with RLS policies for secure file access';