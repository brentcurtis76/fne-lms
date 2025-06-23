-- ===============================================
-- MANUAL: Feedback Screenshots Storage Policies
-- ===============================================
-- Run this SQL in the Supabase Dashboard SQL Editor
-- Authentication → Settings → Dashboard → SQL Editor
-- ===============================================

-- 1. Ensure the bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  true, -- Public bucket for easy viewing
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 2. Drop any existing policies (clean slate)
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- 3. Create RLS policies for feedback-screenshots bucket

-- Allow authenticated users to upload screenshots
-- Path structure: feedback/{user_id}/{timestamp}_{filename}
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'feedback-screenshots' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = 'feedback' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow anyone to view feedback screenshots
-- (Admins need to see all screenshots for feedback review)
CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'feedback-screenshots');

-- Allow users to update their own screenshots
CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'feedback-screenshots' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'feedback-screenshots' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- 4. Ensure proper permissions are granted
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- 5. Verification query - run this to check if policies were created
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%feedback%'
ORDER BY policyname;

-- Expected results:
-- 1. "Anyone can view feedback screenshots" - SELECT
-- 2. "Users can delete own feedback screenshots" - DELETE  
-- 3. "Users can update own feedback screenshots" - UPDATE
-- 4. "Users can upload feedback screenshots" - INSERT