-- ============================================================================
-- LEARNING PATH SEARCH INDEXES (WITHOUT CONCURRENTLY)
-- This version works in Supabase SQL Editor and migrations
-- Note: These will lock tables briefly during creation
-- Best to run during low-traffic periods
-- ============================================================================

-- Enable extension first (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing indexes if they exist (to avoid errors)
DROP INDEX IF EXISTS idx_user_roles_school_active;
DROP INDEX IF EXISTS idx_user_roles_community_active;
DROP INDEX IF EXISTS idx_user_roles_user_school_active;
DROP INDEX IF EXISTS idx_cw_community_id;
DROP INDEX IF EXISTS idx_cw_name_trgm;
DROP INDEX IF EXISTS idx_lpa_path_user;
DROP INDEX IF EXISTS idx_lpa_path_group;
DROP INDEX IF EXISTS idx_lpa_path_id_counts;
DROP INDEX IF EXISTS idx_profiles_first_name_trgm;
DROP INDEX IF EXISTS idx_profiles_last_name_trgm;
DROP INDEX IF EXISTS idx_profiles_email_trgm;

-- ============================================================================
-- CREATE INDEXES (without CONCURRENTLY)
-- These will lock tables briefly but will work in Supabase
-- ============================================================================

-- 1. User roles - school filtering
CREATE INDEX idx_user_roles_school_active 
ON user_roles(school_id, is_active)
WHERE is_active = true;

-- 2. User roles - community filtering  
CREATE INDEX idx_user_roles_community_active 
ON user_roles(community_id, is_active)
WHERE community_id IS NOT NULL AND is_active = true;

-- 3. User roles - user+school lookup
CREATE INDEX idx_user_roles_user_school_active
ON user_roles(user_id, school_id, is_active)
WHERE is_active = true;

-- 4. Community workspaces - community lookup
CREATE INDEX idx_cw_community_id 
ON community_workspaces(community_id);

-- 5. Community workspaces - name search (requires pg_trgm)
CREATE INDEX idx_cw_name_trgm
ON community_workspaces USING gin(name gin_trgm_ops);

-- 6. Learning path assignments - user assignments
CREATE INDEX idx_lpa_path_user 
ON learning_path_assignments(path_id, user_id)
WHERE user_id IS NOT NULL;

-- 7. Learning path assignments - group assignments
CREATE INDEX idx_lpa_path_group 
ON learning_path_assignments(path_id, group_id)
WHERE group_id IS NOT NULL;

-- 8. Learning path assignments - counting
-- Note: INCLUDE clause requires PostgreSQL 11+
-- Using simpler version without INCLUDE for compatibility
CREATE INDEX idx_lpa_path_id_counts
ON learning_path_assignments(path_id);

-- 9. Profiles - first name search (requires pg_trgm)
CREATE INDEX idx_profiles_first_name_trgm
ON profiles USING gin(first_name gin_trgm_ops);

-- 10. Profiles - last name search (requires pg_trgm)
CREATE INDEX idx_profiles_last_name_trgm
ON profiles USING gin(last_name gin_trgm_ops);

-- 11. Profiles - email search (requires pg_trgm)
CREATE INDEX idx_profiles_email_trgm
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
    'Index created successfully' as status,
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