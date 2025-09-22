-- ============================================================================
-- Fix admin course creation (courses insert denied) by hardening auth_is_admin()
-- Jorge Parra user_id: 372ab00b-1d39-4574-8eff-d756b9d6b861
-- ============================================================================

-- 1. Quick checks
SELECT current_user;

-- Check RLS state and policies
SELECT c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'courses';

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'courses';

-- Check grants for inserts from API role
SELECT has_table_privilege('authenticated', 'public.courses', 'INSERT') AS auth_can_insert;

-- Verify Jorge has active admin role
SELECT COUNT(*) AS admin_roles
FROM user_roles
WHERE user_id = '372ab00b-1d39-4574-8eff-d756b9d6b861'
  AND role_type = 'admin'
  AND is_active = true;

-- 2. Harden auth_is_admin()
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
  v_cache_exists boolean;
BEGIN
  -- Fast path: JWT user metadata
  IF COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin' THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE((auth.jwt() -> 'user_metadata' -> 'roles')::jsonb, '[]'::jsonb)
    ) AS role(value)
    WHERE role.value = 'admin'
  ) THEN
    RETURN true;
  END IF;
  
  -- Check if cache exists before trying to use it
  SELECT EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'user_roles_cache'
  ) INTO v_cache_exists;
  
  -- Cached roles path (only if cache exists)
  IF v_cache_exists THEN
    SELECT is_admin INTO v_is_admin
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    IF COALESCE(v_is_admin, false) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Robust fallback: direct, non-recursive lookup
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = true
  );
END;
$$;

-- Keep execute permission for API role
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;

-- 3. Ensure RLS and admin policy on courses
-- Enable RLS if not already enabled
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Ensure admin-all policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'courses' AND policyname = 'courses_admin_all'
  ) THEN
    CREATE POLICY "courses_admin_all" ON public.courses
      FOR ALL TO authenticated
      USING (public.auth_is_admin())
      WITH CHECK (public.auth_is_admin());
  END IF;
END $$;

-- 4. Ensure authenticated can INSERT at the privilege layer
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.courses TO authenticated;

-- 5. Optional: refresh cache (only if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'user_roles_cache'
  ) THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_roles_cache;
  END IF;
END $$;

-- 6. Validate
-- Should return true when executed under Jorge's session
SELECT public.auth_is_admin() AS is_admin;

-- Verify policies show the admin policy with FOR ALL and both USING/WITH CHECK on auth_is_admin()
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'courses';

-- Final verification: Jorge's admin status
SELECT 
  ur.user_id,
  ur.role_type,
  ur.is_active,
  public.auth_is_admin() as function_result
FROM user_roles ur
WHERE ur.user_id = '372ab00b-1d39-4574-8eff-d756b9d6b861'
  AND ur.role_type = 'admin';

-- Check if cache exists
SELECT EXISTS (
  SELECT 1 FROM pg_matviews 
  WHERE schemaname = 'public' 
  AND matviewname = 'user_roles_cache'
) as cache_exists;
