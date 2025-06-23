-- ===============================================
-- Feedback Screenshots Storage Configuration
-- ===============================================
-- Creates storage bucket and policies for feedback screenshots
-- ===============================================

-- Create the storage bucket
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

-- Storage policies for feedback-screenshots bucket
-- Note: These policies apply to the storage.objects table

-- Allow authenticated users to upload screenshots
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'feedback-screenshots' AND
  auth.uid() IS NOT NULL AND
  -- Path should be: feedback/{user_id}/{timestamp}_{filename}
  (storage.foldername(name))[1] = 'feedback' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow anyone to view feedback screenshots (since admins need to see all)
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

-- Grant necessary permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- Output confirmation
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===== FEEDBACK STORAGE SETUP COMPLETE =====';
  RAISE NOTICE '✓ Storage bucket created: feedback-screenshots';
  RAISE NOTICE '✓ File size limit: 5MB';
  RAISE NOTICE '✓ Allowed types: JPEG, PNG, WebP';
  RAISE NOTICE '✓ Path structure: feedback/{user_id}/{timestamp}_{filename}';
  RAISE NOTICE '✓ RLS policies configured';
  RAISE NOTICE '==========================================';
END $$;