-- Migration: Add indexes for learning path search performance (SAFE VERSION)
-- Purpose: Optimize queries for school-filtered searches and member counts
-- Author: System
-- Date: 2024-01-11
-- 
-- IMPORTANT: Run this script to check and create indexes safely
-- If an index already exists, it will be skipped

-- First, check which indexes already exist
DO $$
BEGIN
    RAISE NOTICE 'Checking existing indexes...';
END $$;

SELECT 
    indexname,
    'EXISTS' as status
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname IN (
    'idx_user_roles_school_active',
    'idx_user_roles_community_active',
    'idx_user_roles_user_school_active',
    'idx_cw_community_id',
    'idx_cw_name_trgm',
    'idx_lpa_path_user',
    'idx_lpa_path_group',
    'idx_lpa_path_id_counts',
    'idx_profiles_first_name_trgm',
    'idx_profiles_last_name_trgm',
    'idx_profiles_email_trgm'
);

-- ============================================================================
-- Create indexes that don't exist
-- Run each command individually and skip if it fails due to duplicate
-- ============================================================================

-- 1. idx_user_roles_school_active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_user_roles_school_active'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY idx_user_roles_school_active 
                 ON user_roles(school_id, is_active)
                 WHERE is_active = true';
        RAISE NOTICE 'Created index: idx_user_roles_school_active';
    ELSE
        RAISE NOTICE 'Index already exists: idx_user_roles_school_active';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_user_roles_school_active';
END $$;

-- 2. idx_user_roles_community_active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_user_roles_community_active'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY idx_user_roles_community_active 
                 ON user_roles(community_id, is_active)
                 WHERE community_id IS NOT NULL AND is_active = true';
        RAISE NOTICE 'Created index: idx_user_roles_community_active';
    ELSE
        RAISE NOTICE 'Index already exists: idx_user_roles_community_active';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_user_roles_community_active';
END $$;

-- 3. idx_user_roles_user_school_active
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_user_roles_user_school_active'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY idx_user_roles_user_school_active
                 ON user_roles(user_id, school_id, is_active)
                 WHERE is_active = true';
        RAISE NOTICE 'Created index: idx_user_roles_user_school_active';
    ELSE
        RAISE NOTICE 'Index already exists: idx_user_roles_user_school_active';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_user_roles_user_school_active';
END $$;

-- 4. idx_cw_community_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_cw_community_id'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY idx_cw_community_id 
                 ON community_workspaces(community_id)';
        RAISE NOTICE 'Created index: idx_cw_community_id';
    ELSE
        RAISE NOTICE 'Index already exists: idx_cw_community_id';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_cw_community_id';
END $$;

-- 5. idx_cw_name_trgm
DO $$
BEGIN
    -- First check if gin_trgm extension exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = 'idx_cw_name_trgm'
        ) THEN
            EXECUTE 'CREATE INDEX CONCURRENTLY idx_cw_name_trgm
                     ON community_workspaces USING gin(name gin_trgm_ops)';
            RAISE NOTICE 'Created index: idx_cw_name_trgm';
        ELSE
            RAISE NOTICE 'Index already exists: idx_cw_name_trgm';
        END IF;
    ELSE
        RAISE NOTICE 'Skipping idx_cw_name_trgm - pg_trgm extension not installed';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_cw_name_trgm';
    WHEN undefined_object THEN
        RAISE NOTICE 'Skipping idx_cw_name_trgm - pg_trgm extension not available';
END $$;

-- 6. idx_lpa_path_user
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_lpa_path_user'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY idx_lpa_path_user 
                 ON learning_path_assignments(path_id, user_id)
                 WHERE user_id IS NOT NULL';
        RAISE NOTICE 'Created index: idx_lpa_path_user';
    ELSE
        RAISE NOTICE 'Index already exists: idx_lpa_path_user';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_lpa_path_user';
END $$;

-- 7. idx_lpa_path_group
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_lpa_path_group'
    ) THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY idx_lpa_path_group 
                 ON learning_path_assignments(path_id, group_id)
                 WHERE group_id IS NOT NULL';
        RAISE NOTICE 'Created index: idx_lpa_path_group';
    ELSE
        RAISE NOTICE 'Index already exists: idx_lpa_path_group';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_lpa_path_group';
END $$;

-- 8. idx_lpa_path_id_counts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = 'idx_lpa_path_id_counts'
    ) THEN
        -- Note: INCLUDE clause might not be supported in all PostgreSQL versions
        BEGIN
            EXECUTE 'CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts
                     ON learning_path_assignments(path_id)
                     INCLUDE (user_id, group_id)';
            RAISE NOTICE 'Created index: idx_lpa_path_id_counts with INCLUDE';
        EXCEPTION
            WHEN syntax_error THEN
                -- Fallback without INCLUDE clause
                EXECUTE 'CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts
                         ON learning_path_assignments(path_id)';
                RAISE NOTICE 'Created index: idx_lpa_path_id_counts (without INCLUDE)';
        END;
    ELSE
        RAISE NOTICE 'Index already exists: idx_lpa_path_id_counts';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_lpa_path_id_counts';
END $$;

-- 9. idx_profiles_first_name_trgm
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = 'idx_profiles_first_name_trgm'
        ) THEN
            EXECUTE 'CREATE INDEX CONCURRENTLY idx_profiles_first_name_trgm
                     ON profiles USING gin(first_name gin_trgm_ops)';
            RAISE NOTICE 'Created index: idx_profiles_first_name_trgm';
        ELSE
            RAISE NOTICE 'Index already exists: idx_profiles_first_name_trgm';
        END IF;
    ELSE
        RAISE NOTICE 'Skipping idx_profiles_first_name_trgm - pg_trgm extension not installed';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_profiles_first_name_trgm';
    WHEN undefined_object THEN
        RAISE NOTICE 'Skipping idx_profiles_first_name_trgm - pg_trgm extension not available';
END $$;

-- 10. idx_profiles_last_name_trgm
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = 'idx_profiles_last_name_trgm'
        ) THEN
            EXECUTE 'CREATE INDEX CONCURRENTLY idx_profiles_last_name_trgm
                     ON profiles USING gin(last_name gin_trgm_ops)';
            RAISE NOTICE 'Created index: idx_profiles_last_name_trgm';
        ELSE
            RAISE NOTICE 'Index already exists: idx_profiles_last_name_trgm';
        END IF;
    ELSE
        RAISE NOTICE 'Skipping idx_profiles_last_name_trgm - pg_trgm extension not installed';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_profiles_last_name_trgm';
    WHEN undefined_object THEN
        RAISE NOTICE 'Skipping idx_profiles_last_name_trgm - pg_trgm extension not available';
END $$;

-- 11. idx_profiles_email_trgm
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = 'idx_profiles_email_trgm'
        ) THEN
            EXECUTE 'CREATE INDEX CONCURRENTLY idx_profiles_email_trgm
                     ON profiles USING gin(email gin_trgm_ops)';
            RAISE NOTICE 'Created index: idx_profiles_email_trgm';
        ELSE
            RAISE NOTICE 'Index already exists: idx_profiles_email_trgm';
        END IF;
    ELSE
        RAISE NOTICE 'Skipping idx_profiles_email_trgm - pg_trgm extension not installed';
    END IF;
EXCEPTION
    WHEN duplicate_table THEN
        RAISE NOTICE 'Index already exists: idx_profiles_email_trgm';
    WHEN undefined_object THEN
        RAISE NOTICE 'Skipping idx_profiles_email_trgm - pg_trgm extension not available';
END $$;

-- ============================================================================
-- Update statistics after creating indexes
-- ============================================================================

ANALYZE user_roles;
ANALYZE community_workspaces;
ANALYZE learning_path_assignments;
ANALYZE profiles;

-- ============================================================================
-- Final report
-- ============================================================================

SELECT 
    'Summary: Indexes created/verified' as message,
    COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname IN (
    'idx_user_roles_school_active',
    'idx_user_roles_community_active',
    'idx_user_roles_user_school_active',
    'idx_cw_community_id',
    'idx_cw_name_trgm',
    'idx_lpa_path_user',
    'idx_lpa_path_group',
    'idx_lpa_path_id_counts',
    'idx_profiles_first_name_trgm',
    'idx_profiles_last_name_trgm',
    'idx_profiles_email_trgm'
);