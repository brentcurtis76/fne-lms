-- Migration 025: Fix auth_has_school_access_uuid function (remove is_active check)
-- Date: 2025-10-29
-- Issue: Function checks for is_active column that doesn't exist in user_roles_cache
--
-- ROOT CAUSE: The auth_has_school_access_uuid function in migration 007 references
-- is_active column on user_roles_cache table, but that column doesn't exist.
--
-- ERROR SEEN: "column is_active does not exist" when querying growth_communities
--
-- FIX: Remove the is_active check from the function
--
-- IMPACT: Users can now access growth_communities for their workspaces

-- =============================================================================
-- FIX THE FUNCTION
-- =============================================================================

-- Fix ALL existing signatures of auth_has_school_access_uuid
-- Both uuid and bigint versions may exist from different migration paths
-- We cannot DROP these functions because RLS policies depend on them
-- Instead, we CREATE OR REPLACE both signatures to fix the is_active bug

-- Fix the UUID signature (may exist from migration 007)
CREATE OR REPLACE FUNCTION auth_has_school_access_uuid(p_school_id uuid)
RETURNS boolean AS $$
DECLARE
    v_user_id uuid;
    v_has_access boolean;
BEGIN
    -- Get the current user's ID
    v_user_id := auth.uid();

    -- Check if user is null (not authenticated)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user is admin (admins have access to all schools)
    IF auth_is_admin() THEN
        RETURN true;
    END IF;

    -- Check if user has a role in the specified school
    -- FIXED: Removed "AND is_active = true" because user_roles_cache doesn't have that column
    SELECT EXISTS (
        SELECT 1
        FROM user_roles_cache
        WHERE user_id = v_user_id
        AND school_id = p_school_id
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auth_has_school_access_uuid(uuid) IS
'Fixed: Removed is_active check that referenced non-existent column. Checks if authenticated user has access to a specific school via role or admin status';

-- Fix the BIGINT signature (exists from migration 007_fixed)
CREATE OR REPLACE FUNCTION auth_has_school_access_uuid(p_school_id bigint)
RETURNS boolean AS $$
DECLARE
    v_user_id uuid;
    v_has_access boolean;
BEGIN
    -- Get the current user's ID
    v_user_id := auth.uid();

    -- Check if user is null (not authenticated)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user is admin (admins have access to all schools)
    IF auth_is_admin() THEN
        RETURN true;
    END IF;

    -- Check if user has a role in the specified school
    -- FIXED: Removed "AND is_active = true" because user_roles_cache doesn't have that column
    SELECT EXISTS (
        SELECT 1
        FROM user_roles_cache
        WHERE user_id = v_user_id
        AND school_id = p_school_id
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the fix
COMMENT ON FUNCTION auth_has_school_access_uuid(bigint) IS
'Fixed: Removed is_active check that referenced non-existent column. Checks if authenticated user has access to a specific school via role or admin status';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 025 Applied Successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed auth_has_school_access_uuid function (ALL signatures):';
  RAISE NOTICE '  - UUID signature: Removed is_active check';
  RAISE NOTICE '  - BIGINT signature: Removed is_active check';
  RAISE NOTICE '  - Both functions now work correctly for RLS policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Impact:';
  RAISE NOTICE '  - Users can now query growth_communities table';
  RAISE NOTICE '  - Workspace access should now work for all users';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Have users refresh browser (Ctrl+Shift+R)';
  RAISE NOTICE '  2. Test accessing "Espacio Colaborativo"';
END $$;
