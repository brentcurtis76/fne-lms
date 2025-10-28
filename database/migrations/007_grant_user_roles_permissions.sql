-- =====================================================
-- Migration 007: Grant Permissions on user_roles Table
-- =====================================================
-- Author: Claude Code
-- Date: 2025-10-06
-- Status: CRITICAL FIX
--
-- Problem: API returns "permission denied for table user_roles"
-- Root Cause: RLS policies/functions access user_roles but anon/authenticated lack SELECT permission
--
-- Solution: Grant SELECT on user_roles to anon and authenticated roles
-- =====================================================

BEGIN;

-- Grant SELECT permission on user_roles to anon role
GRANT SELECT ON public.user_roles TO anon;

-- Grant SELECT permission on user_roles to authenticated role
GRANT SELECT ON public.user_roles TO authenticated;

-- Also grant on user_roles_cache for safety
GRANT SELECT ON public.user_roles_cache TO anon;
GRANT SELECT ON public.user_roles_cache TO authenticated;

-- Verify grants
SELECT
    table_name,
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('user_roles', 'user_roles_cache')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee;

COMMIT;

-- =====================================================
-- Test the fix
-- =====================================================

-- This should now work without permission errors
SELECT id, name, has_generations
FROM public.schools
WHERE id = 9;

-- Verification message
DO $$
BEGIN
    RAISE NOTICE '✅ Permissions granted successfully';
    RAISE NOTICE '✅ user_roles: SELECT granted to anon, authenticated';
    RAISE NOTICE '✅ user_roles_cache: SELECT granted to anon, authenticated';
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
