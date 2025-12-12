-- Cleanup script for bulk import test users
-- Run this in Supabase SQL Editor after testing
-- WARNING: This will permanently delete these test users

-- Email pattern for test users
-- All test users have emails ending in @fne-test.com

BEGIN;

-- Step 1: Get user IDs for test users
DO $$
DECLARE
    test_user_ids uuid[];
    user_count integer;
BEGIN
    -- Collect all test user IDs
    SELECT array_agg(id) INTO test_user_ids
    FROM auth.users
    WHERE email LIKE '%@fne-test.com';

    IF test_user_ids IS NULL THEN
        RAISE NOTICE 'No test users found to delete.';
        RETURN;
    END IF;

    user_count := array_length(test_user_ids, 1);
    RAISE NOTICE 'Found % test users to delete', user_count;

    -- Step 2: Delete from user_roles
    DELETE FROM user_roles WHERE user_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted user_roles entries';

    -- Step 3: Delete from audit_logs
    DELETE FROM audit_logs WHERE user_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted audit_logs entries';

    -- Step 4: Delete from course_enrollments (if any)
    DELETE FROM course_enrollments WHERE user_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted course_enrollments entries';

    -- Step 5: Delete from lesson_progress (if any)
    DELETE FROM lesson_progress WHERE user_id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted lesson_progress entries';

    -- Step 6: Delete from profiles
    DELETE FROM profiles WHERE id = ANY(test_user_ids);
    RAISE NOTICE 'Deleted profiles entries';

    -- Step 7: Delete from auth.users (this must be done via Supabase dashboard or service role)
    -- The auth.users deletion requires service role permissions
    -- You may need to delete these manually from Supabase Auth dashboard
    RAISE NOTICE 'Auth users must be deleted manually from Supabase Auth dashboard';
    RAISE NOTICE 'Or run: SELECT auth.admin_delete_user(id) FROM auth.users WHERE email LIKE ''%@fne-test.com'';';

END $$;

-- Step 8: Delete auto-created communities for test lider_comunidad users
DELETE FROM growth_communities
WHERE name LIKE 'Comunidad%'
AND (
    name LIKE '%López%'
    OR name LIKE '%Silva%'
    OR name LIKE '%Fernández%'
    OR name LIKE '%González%'
    OR name LIKE '%Pérez%'
    OR name LIKE '%Martínez%'
)
AND created_at > NOW() - INTERVAL '1 day';

COMMIT;

-- Alternative: Quick cleanup using auth.admin_delete_user (requires service role)
-- This will cascade delete profiles and related data
/*
SELECT auth.admin_delete_user(id)
FROM auth.users
WHERE email LIKE '%@fne-test.com';
*/

-- Verify cleanup
SELECT 'Remaining test users:' as info, count(*) as count
FROM auth.users
WHERE email LIKE '%@fne-test.com';

SELECT 'Remaining test profiles:' as info, count(*) as count
FROM profiles
WHERE email LIKE '%@fne-test.com';

SELECT 'Remaining test user_roles:' as info, count(*) as count
FROM user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email LIKE '%@fne-test.com';
