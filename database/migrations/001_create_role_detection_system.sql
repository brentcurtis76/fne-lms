-- Migration 001: Create a robust role detection system
-- This creates a proper foundation for role-based access control
-- that doesn't rely on recursive lookups

-- Create a materialized view for role lookups to avoid recursion
-- This will be refreshed whenever roles change
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

-- Create index for fast lookups
CREATE UNIQUE INDEX idx_user_roles_cache_user_id ON user_roles_cache(user_id);
CREATE INDEX idx_user_roles_cache_role ON user_roles_cache(role);
CREATE INDEX idx_user_roles_cache_is_admin ON user_roles_cache(is_admin);
CREATE INDEX idx_user_roles_cache_is_teacher ON user_roles_cache(is_teacher);

-- Create a function to refresh the cache
CREATE OR REPLACE FUNCTION public.refresh_user_roles_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache;
END;
$$;

-- Create triggers to refresh cache when profiles change
CREATE OR REPLACE FUNCTION public.trigger_refresh_user_roles_cache()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Use pg_notify to handle this asynchronously
    PERFORM pg_notify('refresh_user_roles_cache', 'roles_changed');
    RETURN NULL;
END;
$$;

-- Create triggers on user_roles table instead of profiles
CREATE TRIGGER user_roles_changed_refresh_cache
AFTER INSERT OR UPDATE OR DELETE ON user_roles
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_refresh_user_roles_cache();

-- Also trigger on profiles for approval_status changes
CREATE TRIGGER profiles_approval_changed_refresh_cache
AFTER UPDATE OF approval_status ON profiles
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_refresh_user_roles_cache();

-- Create secure functions for role checking that won't cause recursion
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- First check JWT metadata (fastest)
    IF (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' THEN
        RETURN true;
    END IF;
    
    -- Then check the cache
    SELECT is_admin INTO v_is_admin
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    RETURN COALESCE(v_is_admin, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_is_teacher()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_is_teacher boolean;
BEGIN
    -- First check JWT metadata
    IF (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'consultor') THEN
        RETURN true;
    END IF;
    
    -- Then check the cache
    SELECT is_teacher INTO v_is_teacher
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    RETURN COALESCE(v_is_teacher, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_get_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_role text;
BEGIN
    -- First check JWT metadata
    v_role := auth.jwt() -> 'user_metadata' ->> 'role';
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;
    
    -- Then check the cache
    SELECT role INTO v_role
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    RETURN v_role;
END;
$$;

-- Create a function to check if a user has access to a specific school
CREATE OR REPLACE FUNCTION public.auth_has_school_access(p_school_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_user_school_id bigint;
BEGIN
    -- Admins have access to all schools
    IF auth_is_admin() THEN
        RETURN true;
    END IF;
    
    -- Check user's school
    SELECT school_id INTO v_user_school_id
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    RETURN v_user_school_id = p_school_id;
END;
$$;

-- Create a function to check if a user is a teacher for a specific course
CREATE OR REPLACE FUNCTION public.auth_is_course_teacher(p_course_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    -- Admins are teachers for all courses
    IF auth_is_admin() THEN
        RETURN true;
    END IF;
    
    -- Check course assignments
    RETURN EXISTS (
        SELECT 1
        FROM course_assignments ca
        WHERE ca.course_id = p_course_id
        AND ca.teacher_id = auth.uid()
    );
END;
$$;

-- Create a function to check if a user is enrolled in a course
CREATE OR REPLACE FUNCTION public.auth_is_course_student(p_course_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM course_enrollments ce
        WHERE ce.course_id = p_course_id
        AND ce.student_id = auth.uid()
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_teacher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_school_access(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_course_teacher(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_course_student(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_roles_cache() TO authenticated;

-- Grant select on the cache to authenticated users
GRANT SELECT ON user_roles_cache TO authenticated;

-- Initial population of the cache
REFRESH MATERIALIZED VIEW user_roles_cache;

-- Add comment explaining the system
COMMENT ON MATERIALIZED VIEW user_roles_cache IS 'Cached user roles to prevent recursive RLS policy lookups. Automatically refreshed when profiles change.';
COMMENT ON FUNCTION auth_is_admin() IS 'Check if current user is admin. Uses JWT metadata first, then falls back to cached roles.';
COMMENT ON FUNCTION auth_is_teacher() IS 'Check if current user is a teacher (admin or consultor). Uses JWT metadata first, then falls back to cached roles.';