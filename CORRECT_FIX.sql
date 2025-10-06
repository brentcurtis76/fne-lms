-- CORRECT FIX: Allow multiple roles per user in cache
-- The original migration incorrectly assumed one role per user
-- This fixes the bug while maintaining the multi-role system

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS public.user_roles_cache CASCADE;

-- Create the materialized view (same as before)
CREATE MATERIALIZED VIEW public.user_roles_cache AS
SELECT
    ur.user_id,
    ur.role_type as role,
    ur.school_id,
    ur.generation_id,
    ur.community_id,
    p.approval_status,
    CASE
        WHEN ur.role_type = 'admin' THEN true
        ELSE false
    END as is_admin,
    CASE
        WHEN ur.role_type IN ('admin', 'consultor') THEN true
        ELSE false
    END as is_teacher,
    NOW() as cached_at
FROM user_roles ur
JOIN profiles p ON ur.user_id = p.id
WHERE ur.is_active = true
AND p.approval_status = 'approved';

-- Create indexes for performance
-- NOTE: Changed from UNIQUE to non-unique to support multiple roles per user
CREATE INDEX idx_user_roles_cache_user_id ON user_roles_cache(user_id);  -- NOT UNIQUE!
CREATE INDEX idx_user_roles_cache_role ON user_roles_cache(role);
CREATE INDEX idx_user_roles_cache_is_admin ON user_roles_cache(is_admin);
CREATE INDEX idx_user_roles_cache_is_teacher ON user_roles_cache(is_teacher);

-- Grant permissions
GRANT SELECT ON user_roles_cache TO authenticated;
GRANT SELECT ON user_roles_cache TO anon;

-- Verify: Show users with multiple roles
SELECT user_id, COUNT(*) as role_count, array_agg(role) as roles
FROM user_roles_cache
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY role_count DESC
LIMIT 10;

-- Verify: Total cached users and roles
SELECT COUNT(*) as total_rows FROM user_roles_cache;
SELECT COUNT(DISTINCT user_id) as unique_users FROM user_roles_cache;
