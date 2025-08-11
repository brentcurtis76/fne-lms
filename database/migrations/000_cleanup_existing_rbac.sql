-- ============================================================================
-- CLEANUP SCRIPT - Run this BEFORE 001_bootstrap_superadmin.sql
-- This safely removes existing RBAC objects if they exist
-- ============================================================================

-- Drop existing functions (if they exist)
DROP FUNCTION IF EXISTS auth_is_superadmin(uuid) CASCADE;
DROP FUNCTION IF EXISTS auth_is_superadmin() CASCADE;

-- Drop existing policies that depend on these functions
DROP POLICY IF EXISTS "Superadmins can read all superadmin records" ON superadmins;
DROP POLICY IF EXISTS "Superadmins can manage all superadmin records" ON superadmins;
DROP POLICY IF EXISTS "Superadmins can read test mode settings" ON superadmin_test_mode;
DROP POLICY IF EXISTS "Superadmins can manage test mode settings" ON superadmin_test_mode;
DROP POLICY IF EXISTS "Superadmins can read permission overlays" ON superadmin_permission_overlays;
DROP POLICY IF EXISTS "Superadmins can manage permission overlays" ON superadmin_permission_overlays;

-- Drop tables if they exist (CASCADE will drop dependent objects)
DROP TABLE IF EXISTS superadmin_permission_overlays CASCADE;
DROP TABLE IF EXISTS superadmin_test_mode CASCADE;
DROP TABLE IF EXISTS superadmins CASCADE;

-- Now you can safely run 001_bootstrap_superadmin.sql