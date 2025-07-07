-- =====================================================
-- Drop Legacy Role Column from Profiles Table
-- =====================================================
-- WARNING: This migration removes the legacy role column from the profiles table.
-- Only run this after ensuring all systems have migrated to using the user_roles table.
-- 
-- Pre-migration checklist:
-- 1. All users have been migrated to user_roles table
-- 2. All code has been updated to use user_roles instead of profiles.role
-- 3. JWT sync code has been removed or updated
-- 4. All API endpoints use the new role system
-- =====================================================

-- First, create a backup of the current role data (optional but recommended)
CREATE TABLE IF NOT EXISTS profiles_role_backup AS
SELECT id, role, updated_at
FROM profiles
WHERE role IS NOT NULL;

-- Add a comment to the backup table
COMMENT ON TABLE profiles_role_backup IS 'Backup of legacy role data from profiles table before dropping the column. Created on migration date.';

-- =====================================================
-- Remove Role Column from Profiles Table
-- =====================================================

-- Drop any indexes on the role column
DROP INDEX IF EXISTS idx_profiles_role;

-- Drop any constraints that might reference the role column
-- Note: Add any specific constraint names here if they exist

-- Drop the role column
ALTER TABLE profiles DROP COLUMN IF EXISTS role;

-- =====================================================
-- Update Functions and Views
-- =====================================================

-- If there are any functions or views that reference profiles.role,
-- they need to be updated. List them here:

-- Example (uncomment and modify as needed):
-- CREATE OR REPLACE FUNCTION get_user_info(p_user_id UUID)
-- RETURNS TABLE(...) AS $$
-- BEGIN
--   -- Updated function without role column
-- END;
-- $$ LANGUAGE plpgsql;

-- =====================================================
-- Verification Queries
-- =====================================================

-- After running this migration, you can verify with:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'profiles' AND column_name = 'role';
-- This should return 0 rows

-- To check the backup table:
-- SELECT COUNT(*) FROM profiles_role_backup;

-- =====================================================
-- Rollback Instructions (if needed)
-- =====================================================
-- To rollback this migration:
-- ALTER TABLE profiles ADD COLUMN role TEXT;
-- UPDATE profiles p SET role = b.role FROM profiles_role_backup b WHERE p.id = b.id;
-- DROP TABLE profiles_role_backup;
-- =====================================================