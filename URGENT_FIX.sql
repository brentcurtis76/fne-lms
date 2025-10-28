-- URGENT FIX: Create missing user_roles_cache materialized view
-- This fixes the "Error cargando el curso" bug affecting ALL students
-- Execute this SQL in Supabase SQL Editor immediately

-- Step 1: Create the materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.user_roles_cache AS
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

-- Step 2: Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_cache_user_id ON user_roles_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_cache_role ON user_roles_cache(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_cache_is_admin ON user_roles_cache(is_admin);
CREATE INDEX IF NOT EXISTS idx_user_roles_cache_is_teacher ON user_roles_cache(is_teacher);

-- Step 3: Grant permissions
GRANT SELECT ON user_roles_cache TO authenticated;
GRANT SELECT ON user_roles_cache TO anon;

-- Step 4: Refresh the view with current data
REFRESH MATERIALIZED VIEW user_roles_cache;

-- Verification query
SELECT COUNT(*) as cached_users FROM user_roles_cache;
