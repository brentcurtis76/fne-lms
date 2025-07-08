-- Test script for consultant group management migration
-- Run this after applying the migration to verify everything works

-- ============================================
-- TEST 1: Verify new columns exist
-- ============================================
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'group_assignment_groups'
AND column_name IN ('created_by', 'is_consultant_managed', 'max_members')
ORDER BY column_name;

-- Expected: 3 rows showing the new columns

-- ============================================
-- TEST 2: Verify new table exists with correct structure
-- ============================================
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'group_assignment_settings'
ORDER BY ordinal_position;

-- Expected: All columns of the new table

-- ============================================
-- TEST 3: Verify existing groups are unaffected
-- ============================================
SELECT 
    id,
    assignment_id,
    created_by,
    is_consultant_managed,
    max_members,
    CASE 
        WHEN created_by IS NULL AND is_consultant_managed = FALSE 
        THEN 'Auto-created (existing)'
        ELSE 'Modified or New'
    END as group_type
FROM group_assignment_groups
LIMIT 10;

-- Expected: All existing groups should have:
-- created_by = NULL
-- is_consultant_managed = FALSE
-- max_members = 8

-- ============================================
-- TEST 4: Test creating a consultant-managed group
-- ============================================
DO $$
DECLARE
    test_assignment_id TEXT := 'test_lesson_123_block_0';
    test_community_id UUID;
    test_group_id UUID;
BEGIN
    -- Get a test community ID (use first available)
    SELECT id INTO test_community_id FROM growth_communities LIMIT 1;
    
    IF test_community_id IS NULL THEN
        RAISE NOTICE 'No communities found for testing';
        RETURN;
    END IF;

    -- First, enable consultant management for this assignment
    INSERT INTO group_assignment_settings (
        assignment_id,
        consultant_managed,
        min_group_size,
        max_group_size,
        created_by
    ) VALUES (
        test_assignment_id,
        TRUE,
        3,
        6,
        auth.uid()
    );

    -- Create a consultant-managed group
    INSERT INTO group_assignment_groups (
        assignment_id,
        community_id,
        name,
        created_by,
        is_consultant_managed,
        max_members
    ) VALUES (
        test_assignment_id,
        test_community_id,
        'Test Consultant Group',
        auth.uid(),
        TRUE,
        6
    ) RETURNING id INTO test_group_id;

    RAISE NOTICE 'Successfully created test consultant-managed group with ID: %', test_group_id;

    -- Verify the group was created correctly
    PERFORM * FROM group_assignment_groups 
    WHERE id = test_group_id 
    AND is_consultant_managed = TRUE
    AND created_by IS NOT NULL;

    IF FOUND THEN
        RAISE NOTICE 'Test group verified successfully';
    ELSE
        RAISE EXCEPTION 'Test group verification failed';
    END IF;

    -- Clean up test data
    DELETE FROM group_assignment_groups WHERE id = test_group_id;
    DELETE FROM group_assignment_settings WHERE assignment_id = test_assignment_id;
    
    RAISE NOTICE 'Test data cleaned up successfully';
END $$;

-- ============================================
-- TEST 5: Verify indexes were created
-- ============================================
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('group_assignment_groups', 'group_assignment_settings')
AND indexname LIKE 'idx_group_assignment_%'
ORDER BY indexname;

-- Expected: 3 new indexes

-- ============================================
-- TEST 6: Verify RLS policies
-- ============================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'group_assignment_settings'
ORDER BY policyname;

-- Expected: 2 policies for consultants

-- ============================================
-- TEST 7: Test constraint validation
-- ============================================
DO $$
BEGIN
    -- Test invalid max_members (should fail)
    BEGIN
        INSERT INTO group_assignment_groups (
            assignment_id, community_id, name, max_members
        ) VALUES (
            'test_invalid', gen_random_uuid(), 'Invalid Group', 1
        );
        RAISE EXCEPTION 'Constraint check failed - max_members < 2 was allowed!';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'SUCCESS: max_members constraint working (rejected value < 2)';
    END;

    -- Test invalid group size range (should fail)
    BEGIN
        INSERT INTO group_assignment_settings (
            assignment_id, min_group_size, max_group_size
        ) VALUES (
            'test_invalid_range', 5, 3
        );
        RAISE EXCEPTION 'Constraint check failed - min > max was allowed!';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'SUCCESS: group size range constraint working';
    END;
END $$;

-- ============================================
-- SUMMARY
-- ============================================
SELECT 
    'Migration Test Complete' as status,
    COUNT(*) FILTER (WHERE is_consultant_managed = FALSE) as auto_groups,
    COUNT(*) FILTER (WHERE is_consultant_managed = TRUE) as consultant_groups,
    COUNT(*) FILTER (WHERE created_by IS NULL) as legacy_groups
FROM group_assignment_groups;