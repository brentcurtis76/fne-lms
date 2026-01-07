-- Migration: Create instructor-photos storage bucket
-- For Netflix-style course visualization
-- Date: 2026-01-07

-- Note: Storage bucket creation must be done via Supabase Dashboard or API
-- This migration documents the required configuration and sets up RLS policies

-- The bucket should be created with these settings:
-- Name: instructor-photos
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif

-- RLS Policies for instructor-photos bucket
-- These policies assume the bucket has been created via Dashboard

-- Policy: Public read access for instructor photos
-- Anyone can view instructor photos
INSERT INTO storage.policies (bucket_id, name, definition, check_expression)
SELECT
  'instructor-photos',
  'Public read access for instructor photos',
  '(bucket_id = ''instructor-photos''::text)',
  null
WHERE EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'instructor-photos'
)
ON CONFLICT DO NOTHING;

-- Alternative: Use storage.objects directly with RLS
-- Enable RLS on storage.objects if not already enabled
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public SELECT on instructor-photos bucket
DO $$
BEGIN
  -- Check if policy exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'instructor_photos_public_read'
  ) THEN
    CREATE POLICY instructor_photos_public_read ON storage.objects
    FOR SELECT
    USING (bucket_id = 'instructor-photos');
  END IF;
END $$;

-- Policy: Allow authenticated admin users to INSERT into instructor-photos bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'instructor_photos_admin_insert'
  ) THEN
    CREATE POLICY instructor_photos_admin_insert ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'instructor-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role_name = 'admin'
      )
    );
  END IF;
END $$;

-- Policy: Allow authenticated admin users to UPDATE instructor photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'instructor_photos_admin_update'
  ) THEN
    CREATE POLICY instructor_photos_admin_update ON storage.objects
    FOR UPDATE
    USING (
      bucket_id = 'instructor-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role_name = 'admin'
      )
    );
  END IF;
END $$;

-- Policy: Allow authenticated admin users to DELETE instructor photos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'instructor_photos_admin_delete'
  ) THEN
    CREATE POLICY instructor_photos_admin_delete ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'instructor-photos'
      AND auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role_name = 'admin'
      )
    );
  END IF;
END $$;
