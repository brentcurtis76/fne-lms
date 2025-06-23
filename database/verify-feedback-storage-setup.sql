-- Verification Script for Feedback Screenshot Storage Setup
-- Run this in your Supabase SQL Editor after creating the policies

-- 1. Check if the feedback-screenshots bucket exists
SELECT 
    id,
    name,
    public,
    created_at,
    updated_at
FROM storage.buckets 
WHERE name = 'feedback-screenshots';

-- 2. List all storage policies for the objects table
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE tablename = 'objects' 
    AND schemaname = 'storage'
ORDER BY policyname;

-- 3. Check specifically for feedback screenshot policies
SELECT 
    policyname, 
    cmd as operation,
    roles,
    CASE 
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as using_clause,
    CASE 
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as with_check_clause
FROM pg_policies 
WHERE tablename = 'objects' 
    AND schemaname = 'storage'
    AND policyname LIKE '%feedback screenshots%'
ORDER BY policyname;

-- 4. Check if RLS is enabled on storage.objects
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'storage' 
    AND tablename = 'objects';

-- 5. Test query to see what a typical file path structure would look like
-- This is just informational - shows the expected path structure
SELECT 
    'Expected file path structure:' as info,
    'feedback-screenshots/feedback/' || '12345678-1234-5678-9012-123456789012' || '/screenshot.png' as example_path
UNION ALL
SELECT 
    'Folder structure breakdown:' as info,
    'bucket: feedback-screenshots, folder1: feedback, folder2: user_uuid, file: screenshot.png' as example_breakdown;