-- ============================================================================
-- LEARNING PATH SEARCH INDEXES
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor)
-- Each command runs separately - ignore "already exists" errors
-- ============================================================================

-- Enable extension first (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Check what indexes already exist
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY indexname;

-- ============================================================================
-- CREATE EACH INDEX (run one at a time if needed)
-- If you get "already exists" error, that's fine - skip to the next one
-- ============================================================================

-- 1. User roles - school filtering
CREATE INDEX CONCURRENTLY idx_user_roles_school_active 
ON user_roles(school_id, is_active)
WHERE is_active = true;

-- 2. User roles - community filtering  
CREATE INDEX CONCURRENTLY idx_user_roles_community_active 
ON user_roles(community_id, is_active)
WHERE community_id IS NOT NULL AND is_active = true;

-- 3. User roles - user+school lookup
CREATE INDEX CONCURRENTLY idx_user_roles_user_school_active
ON user_roles(user_id, school_id, is_active)
WHERE is_active = true;

-- 4. Community workspaces - community lookup
CREATE INDEX CONCURRENTLY idx_cw_community_id 
ON community_workspaces(community_id);

-- 5. Community workspaces - name search (requires pg_trgm)
CREATE INDEX CONCURRENTLY idx_cw_name_trgm
ON community_workspaces USING gin(name gin_trgm_ops);

-- 6. Learning path assignments - user assignments
CREATE INDEX CONCURRENTLY idx_lpa_path_user 
ON learning_path_assignments(path_id, user_id)
WHERE user_id IS NOT NULL;

-- 7. Learning path assignments - group assignments
CREATE INDEX CONCURRENTLY idx_lpa_path_group 
ON learning_path_assignments(path_id, group_id)
WHERE group_id IS NOT NULL;

-- 8. Learning path assignments - counting (Note: INCLUDE requires PostgreSQL 11+)
CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts
ON learning_path_assignments(path_id)
INCLUDE (user_id, group_id);

-- 9. Profiles - first name search (requires pg_trgm)
CREATE INDEX CONCURRENTLY idx_profiles_first_name_trgm
ON profiles USING gin(first_name gin_trgm_ops);

-- 10. Profiles - last name search (requires pg_trgm)
CREATE INDEX CONCURRENTLY idx_profiles_last_name_trgm
ON profiles USING gin(last_name gin_trgm_ops);

-- 11. Profiles - email search (requires pg_trgm)
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
    indexname,
    tablename,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
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

-- You should see 11 indexes listed above when complete!