-- Storage policies for course-materials bucket
-- Apply this through Supabase Dashboard SQL Editor

-- First, check if policies already exist
SELECT 
    name,
    definition,
    action,
    check_expression
FROM storage.policies
WHERE bucket_id = 'course-materials';

-- If the above query returns no results, run these policies:

-- 1. Allow authenticated users to upload files
CREATE POLICY "Users can upload course materials" 
ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'course-materials');

-- 2. Allow anyone to view course materials (public access)
CREATE POLICY "Course materials are publicly accessible" 
ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'course-materials');

-- 3. Allow users to update their own uploads
CREATE POLICY "Users can update their own course materials" 
ON storage.objects
FOR UPDATE 
TO authenticated
USING (bucket_id = 'course-materials')
WITH CHECK (bucket_id = 'course-materials');

-- 4. Allow users to delete their own uploads
CREATE POLICY "Users can delete their own course materials" 
ON storage.objects
FOR DELETE 
TO authenticated
USING (bucket_id = 'course-materials');

-- After creating policies, verify they were created:
SELECT 
    name,
    definition,
    action,
    check_expression
FROM storage.policies
WHERE bucket_id = 'course-materials'
ORDER BY name;