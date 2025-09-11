-- Migration: Add indexes for learning path search performance
-- Purpose: Optimize queries for school-filtered searches and member counts
-- Author: System
-- Date: 2024-01-11
-- Note: CONCURRENTLY requires running outside transaction block
-- Note: CREATE INDEX doesn't support IF NOT EXISTS with CONCURRENTLY

-- ============================================================================
-- PART 1: Indexes for user_roles table
-- ============================================================================

-- Index for school-based filtering (used when filtering users by school)
-- Drop existing index if needed, then create
-- DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_school_active;
CREATE INDEX CONCURRENTLY idx_user_roles_school_active 
ON user_roles(school_id, is_active)
WHERE is_active = true;

-- Index for community-based filtering (used when filtering groups by school)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_community_active;
CREATE INDEX CONCURRENTLY idx_user_roles_community_active 
ON user_roles(community_id, is_active)
WHERE community_id IS NOT NULL AND is_active = true;

-- Composite index for user lookups by school
-- DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_user_school_active;
CREATE INDEX CONCURRENTLY idx_user_roles_user_school_active
ON user_roles(user_id, school_id, is_active)
WHERE is_active = true;

-- ============================================================================
-- PART 2: Indexes for community_workspaces table
-- ============================================================================

-- Index for community_id lookups (used when fetching groups)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cw_community_id;
CREATE INDEX CONCURRENTLY idx_cw_community_id 
ON community_workspaces(community_id);

-- Index for name searching
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cw_name_trgm;
CREATE INDEX CONCURRENTLY idx_cw_name_trgm
ON community_workspaces USING gin(name gin_trgm_ops);

-- ============================================================================
-- PART 3: Indexes for learning_path_assignments table
-- ============================================================================

-- Composite index for checking user assignments
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lpa_path_user;
CREATE INDEX CONCURRENTLY idx_lpa_path_user 
ON learning_path_assignments(path_id, user_id)
WHERE user_id IS NOT NULL;

-- Composite index for checking group assignments
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lpa_path_group;
CREATE INDEX CONCURRENTLY idx_lpa_path_group 
ON learning_path_assignments(path_id, group_id)
WHERE group_id IS NOT NULL;

-- Index for counting assignments per path
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lpa_path_id_counts;
CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts
ON learning_path_assignments(path_id)
INCLUDE (user_id, group_id);

-- ============================================================================
-- PART 4: Indexes for profiles table (if not already present)
-- ============================================================================

-- Index for name searching (first_name, last_name)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_first_name_trgm;
CREATE INDEX CONCURRENTLY idx_profiles_first_name_trgm
ON profiles USING gin(first_name gin_trgm_ops);

-- DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_last_name_trgm;
CREATE INDEX CONCURRENTLY idx_profiles_last_name_trgm
ON profiles USING gin(last_name gin_trgm_ops);

-- Index for email searching
-- DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_email_trgm;
CREATE INDEX CONCURRENTLY idx_profiles_email_trgm
ON profiles USING gin(email gin_trgm_ops);

-- ============================================================================
-- PART 5: Analyze tables to update statistics
-- ============================================================================

-- Update table statistics for query planner
ANALYZE user_roles;
ANALYZE community_workspaces;
ANALYZE learning_path_assignments;
ANALYZE profiles;

-- ============================================================================
-- VERIFICATION QUERIES (commented for safety)
-- ============================================================================

-- Check that indexes were created:
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('user_roles', 'community_workspaces', 'learning_path_assignments', 'profiles')
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
*/

-- Check index usage statistics:
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('user_roles', 'community_workspaces', 'learning_path_assignments', 'profiles')
ORDER BY tablename, idx_scan DESC;
*/

-- Example query plan to verify index usage:
/*
EXPLAIN (ANALYZE, BUFFERS) 
SELECT user_id 
FROM user_roles 
WHERE school_id = 1 
AND is_active = true;
*/

-- ============================================================================
-- ROLLBACK SECTION (if needed)
-- ============================================================================
-- To rollback this migration, run each DROP INDEX command:
/*
DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_school_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_community_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_roles_user_school_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_cw_community_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_cw_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_lpa_path_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_lpa_path_group;
DROP INDEX CONCURRENTLY IF EXISTS idx_lpa_path_id_counts;
DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_first_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_last_name_trgm;
DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_email_trgm;
*/

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. CONCURRENTLY keyword allows index creation without locking the table
-- 2. Partial indexes (WHERE clauses) reduce index size and improve performance
-- 3. GIN indexes with trigram ops enable fast pattern matching for text search
-- 4. INCLUDE columns in indexes support index-only scans
-- 5. Run ANALYZE after creating indexes to update query planner statistics