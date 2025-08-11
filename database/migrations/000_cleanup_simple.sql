-- ============================================================================
-- SIMPLE CLEANUP - Just drop the conflicting function
-- ============================================================================

-- Only drop the function that's causing the conflict
DROP FUNCTION IF EXISTS auth_is_superadmin(uuid) CASCADE;
DROP FUNCTION IF EXISTS auth_is_superadmin() CASCADE;

-- That's it! Now you can run 001_bootstrap_superadmin.sql