-- Storage policies for course-materials bucket
-- This bucket is used for bibliography PDFs and images in course content

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload course materials" ON storage.objects;
DROP POLICY IF EXISTS "Public can read course materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update course materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete course materials" ON storage.objects;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload course materials"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'course-materials');

-- Allow public read access (so students can view materials without auth)
CREATE POLICY "Public can read course materials"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'course-materials');

-- Allow authenticated users to update their files
CREATE POLICY "Authenticated users can update course materials"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'course-materials');

-- Allow authenticated users to delete their files
CREATE POLICY "Authenticated users can delete course materials"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'course-materials');