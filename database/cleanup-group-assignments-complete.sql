-- Complete cleanup of existing group assignments tables and policies
-- Run this BEFORE running the new migration

-- Step 1: Drop all existing policies
-- =========================================

-- Drop policies on group_assignment_groups
DROP POLICY IF EXISTS "consultores_manage_group_groups" ON group_assignment_groups;
DROP POLICY IF EXISTS "students_view_own_community_groups" ON group_assignment_groups;
DROP POLICY IF EXISTS "students_view_groups_in_community" ON group_assignment_groups;

-- Drop policies on group_assignment_members
DROP POLICY IF EXISTS "consultores_manage_group_members" ON group_assignment_members;
DROP POLICY IF EXISTS "group_members_view_own_groups" ON group_assignment_members;
DROP POLICY IF EXISTS "students_view_own_group_membership" ON group_assignment_members;

-- Drop policies on group_assignment_submissions
DROP POLICY IF EXISTS "consultores_manage_submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "group_submissions_create" ON group_assignment_submissions;
DROP POLICY IF EXISTS "group_submissions_update_own" ON group_assignment_submissions;
DROP POLICY IF EXISTS "group_submissions_view_own" ON group_assignment_submissions;
DROP POLICY IF EXISTS "students_create_submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "students_manage_own_submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "students_update_draft_submissions" ON group_assignment_submissions;

-- Step 2: Drop the view if it exists
-- =========================================
DROP VIEW IF EXISTS group_assignments_with_status CASCADE;

-- Step 3: Drop all tables (CASCADE will drop dependent objects)
-- =========================================
DROP TABLE IF EXISTS group_assignment_submissions CASCADE;
DROP TABLE IF EXISTS group_assignment_members CASCADE;
DROP TABLE IF EXISTS group_assignment_groups CASCADE;

-- Step 4: Verify cleanup
-- =========================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Group Assignments Cleanup Complete ===';
    RAISE NOTICE '';
    RAISE NOTICE 'All existing group assignment tables and policies have been removed.';
    RAISE NOTICE 'You can now run the new migration script.';
    RAISE NOTICE '';
END $$;

-- Verification query
SELECT 
    'Tables remaining:' as info,
    COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions');

SELECT 
    'Policies remaining:' as info,
    COUNT(*) as count
FROM pg_policies
WHERE tablename IN ('group_assignment_groups', 'group_assignment_members', 'group_assignment_submissions');