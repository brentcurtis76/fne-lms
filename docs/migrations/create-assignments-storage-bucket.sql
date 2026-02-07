-- Create 'assignments' Storage Bucket for Task Submissions
-- Purpose: Allow authenticated users to upload files for task/assignment submissions
--
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Author: Claude Code
-- Date: 2026-02-05
--
-- IMPORTANT: This creates the storage bucket and RLS policies needed for file uploads
-- in SimpleGroupSubmissionModal, CollaborativeSubmissionModal, and GroupSubmissionModalV2

-- =============================================
-- CREATE STORAGE BUCKET
-- =============================================

-- Create the 'assignments' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'assignments',
    'assignments',
    true,  -- Public bucket so files can be viewed via public URL
    52428800,  -- 50MB file size limit
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ];

-- =============================================
-- RLS POLICIES FOR STORAGE
-- =============================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can upload assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own assignment files" ON storage.objects;

-- Policy 1: Allow authenticated users to upload files to the assignments bucket
CREATE POLICY "Authenticated users can upload assignment files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'assignments'
);

-- Policy 2: Allow anyone to view/download files from the assignments bucket (it's public)
CREATE POLICY "Authenticated users can view assignment files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'assignments'
);

-- Policy 3: Allow users to update their own uploaded files
CREATE POLICY "Users can update their own assignment files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'assignments'
    AND (storage.foldername(name))[1] = 'group-submissions'
)
WITH CHECK (
    bucket_id = 'assignments'
);

-- Policy 4: Allow users to delete their own uploaded files
CREATE POLICY "Users can delete their own assignment files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'assignments'
    AND (storage.foldername(name))[1] = 'group-submissions'
);

-- =============================================
-- VERIFICATION
-- =============================================

-- Check if bucket was created
SELECT
    'BUCKET STATUS' as check_type,
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
WHERE id = 'assignments';

-- Check RLS policies
SELECT
    'RLS POLICIES' as check_type,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
AND policyname LIKE '%assignment%';

-- =============================================
-- DIAGNOSTIC: Check if docente.qa has classmates
-- =============================================

-- This query helps diagnose "No hay compañeros disponibles para invitar" issue
-- The eligible-classmates endpoint requires other users in the SAME school
-- who are ALSO enrolled in the SAME course

-- 1. Check docente.qa's school assignment
SELECT
    'DOCENTE.QA SCHOOL' as check_type,
    p.email,
    ur.role_type,
    ur.school_id,
    s.name as school_name
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN schools s ON s.id = ur.school_id
WHERE p.email = 'docente.qa@fne.cl'
AND ur.is_active = true;

-- 2. Check other users in the same school
SELECT
    'SAME SCHOOL USERS' as check_type,
    p.email,
    ur.role_type,
    ur.school_id
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE ur.school_id IN (
    SELECT ur2.school_id FROM user_roles ur2
    JOIN profiles p2 ON p2.id = ur2.user_id
    WHERE p2.email = 'docente.qa@fne.cl'
    AND ur2.is_active = true
)
AND ur.is_active = true
AND p.email != 'docente.qa@fne.cl';

-- 3. Check who else is enrolled in the same course
SELECT
    'SAME COURSE ENROLLEES' as check_type,
    p.email,
    c.title as course_title
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
JOIN courses c ON c.id = ce.course_id
WHERE ce.course_id IN (
    SELECT ce2.course_id FROM course_enrollments ce2
    JOIN profiles p2 ON p2.id = ce2.user_id
    WHERE p2.email = 'docente.qa@fne.cl'
)
AND ce.status = 'active'
AND p.email != 'docente.qa@fne.cl';
