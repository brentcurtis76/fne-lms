-- Fix duplicate user_id issue in user_roles_cache
-- The materialized view was created but has duplicate user_ids
-- We need to deduplicate by taking the most recent role per user

-- Drop the existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS public.user_roles_cache CASCADE;

-- Recreate with deduplication (take the first active role per user)
CREATE MATERIALIZED VIEW public.user_roles_cache AS
SELECT DISTINCT ON (ur.user_id)
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
AND p.approval_status = 'approved'
ORDER BY ur.user_id,
    CASE
        WHEN ur.role_type = 'admin' THEN 1
        WHEN ur.role_type = 'consultor' THEN 2
        WHEN ur.role_type = 'supervisor_de_red' THEN 3
        WHEN ur.role_type = 'directivo' THEN 4
        WHEN ur.role_type = 'docente' THEN 5
        WHEN ur.role_type = 'estudiante' THEN 6
        ELSE 7
    END,
    ur.created_at DESC;

-- Create indexes for performance
CREATE UNIQUE INDEX idx_user_roles_cache_user_id ON user_roles_cache(user_id);
CREATE INDEX idx_user_roles_cache_role ON user_roles_cache(role);
CREATE INDEX idx_user_roles_cache_is_admin ON user_roles_cache(is_admin);
CREATE INDEX idx_user_roles_cache_is_teacher ON user_roles_cache(is_teacher);

-- Grant permissions
GRANT SELECT ON user_roles_cache TO authenticated;
GRANT SELECT ON user_roles_cache TO anon;

-- Verify
SELECT COUNT(*) as total_cached_users FROM user_roles_cache;
SELECT role, COUNT(*) as count FROM user_roles_cache GROUP BY role ORDER BY count DESC;
