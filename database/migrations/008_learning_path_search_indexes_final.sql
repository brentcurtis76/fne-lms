-- Migration: Add indexes for learning path search performance (FINAL VERSION)
-- Purpose: Optimize queries for school-filtered searches and member counts
-- Author: System
-- Date: 2024-01-11
-- 
-- IMPORTANT: This script creates indexes one by one.
-- If an index already exists, that command will fail but others will continue.
-- Run each CREATE INDEX separately if you need more control.

-- ============================================================================
-- CHECK EXISTING INDEXES FIRST
-- ============================================================================

SELECT 
    'BEFORE: Checking existing indexes' as status,
    indexname
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
-- CREATE INDEXES
-- Each will fail individually if it already exists, but won't stop others
-- ============================================================================

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- User roles indexes
CREATE INDEX CONCURRENTLY idx_user_roles_school_active 
ON user_roles(school_id, is_active)
WHERE is_active = true;

CREATE INDEX CONCURRENTLY idx_user_roles_community_active 
ON user_roles(community_id, is_active)
WHERE community_id IS NOT NULL AND is_active = true;

CREATE INDEX CONCURRENTLY idx_user_roles_user_school_active
ON user_roles(user_id, school_id, is_active)
WHERE is_active = true;

-- Community workspaces indexes
CREATE INDEX CONCURRENTLY idx_cw_community_id 
ON community_workspaces(community_id);

CREATE INDEX CONCURRENTLY idx_cw_name_trgm
ON community_workspaces USING gin(name gin_trgm_ops);

-- Learning path assignments indexes
CREATE INDEX CONCURRENTLY idx_lpa_path_user 
ON learning_path_assignments(path_id, user_id)
WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_lpa_path_group 
ON learning_path_assignments(path_id, group_id)
WHERE group_id IS NOT NULL;

-- Note: INCLUDE clause requires PostgreSQL 11+
-- If this fails, the index without INCLUDE is still useful
CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts
ON learning_path_assignments(path_id)
INCLUDE (user_id, group_id);

-- Profiles indexes for text search
CREATE INDEX CONCURRENTLY idx_profiles_first_name_trgm
ON profiles USING gin(first_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY idx_profiles_last_name_trgm
ON profiles USING gin(last_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY idx_profiles_email_trgm
ON profiles USING gin(email gin_trgm_ops);

-- ============================================================================
-- UPDATE STATISTICS
-- ============================================================================

ANALYZE user_roles;
ANALYZE community_workspaces;
ANALYZE learning_path_assignments;
ANALYZE profiles;

-- ============================================================================
-- VERIFY INDEXES WERE CREATED
-- ============================================================================

SELECT 
    'AFTER: Successfully created indexes' as status,
    indexname,
    tablename,
    indexdef
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
)
ORDER BY tablename, indexname;

-- ============================================================================
-- MANUAL APPROACH (if automatic fails)
-- ============================================================================
-- If the above fails due to existing indexes, run these commands one by one:
-- 
-- 1. First check what exists:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';
--
-- 2. Then create only the missing ones individually:
-- CREATE INDEX CONCURRENTLY idx_user_roles_school_active ON user_roles(school_id, is_active) WHERE is_active = true;
-- CREATE INDEX CONCURRENTLY idx_user_roles_community_active ON user_roles(community_id, is_active) WHERE community_id IS NOT NULL AND is_active = true;
-- etc...
--
-- 3. Or drop and recreate if needed:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_school_active;
-- CREATE INDEX CONCURRENTLY idx_user_roles_school_active ON user_roles(school_id, is_active) WHERE is_active = true;