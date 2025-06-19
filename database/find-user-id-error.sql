-- Debug script to find where user_id error is coming from

-- 1. Check if the tables already exist with user_id columns
SELECT 
    'Checking existing tables for user_id columns:' as info;

SELECT 
    table_name,
    column_name
FROM information_schema.columns
WHERE column_name = 'user_id'
AND table_schema = 'public'
AND table_name IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions')
ORDER BY table_name;

-- 2. Check if any of the group assignment tables already exist
SELECT 
    '',
    'Checking if group assignment tables exist:' as info;

SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions')
ORDER BY table_name;

-- 3. Check existing policies on these tables
SELECT 
    '',
    'Checking existing policies:' as info;

SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions')
ORDER BY tablename, policyname;

-- 4. Try to drop the tables if they exist (commented out for safety)
-- Uncomment these lines if you want to start fresh:
/*
DROP TABLE IF EXISTS group_assignment_submissions CASCADE;
DROP TABLE IF EXISTS group_assignment_members CASCADE;
DROP TABLE IF EXISTS group_assignment_groups CASCADE;
*/