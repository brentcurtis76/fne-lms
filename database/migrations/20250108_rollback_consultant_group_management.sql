-- Rollback script for consultant group management migration
-- Run this to completely remove the consultant group management feature
-- and return to the original auto-grouping only system

-- ============================================
-- SAFETY CHECK
-- ============================================
DO $$
DECLARE
    consultant_group_count INTEGER;
BEGIN
    -- Check if there are any consultant-managed groups
    SELECT COUNT(*) INTO consultant_group_count
    FROM group_assignment_groups
    WHERE is_consultant_managed = TRUE;

    IF consultant_group_count > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '⚠️  WARNING: There are % consultant-managed groups in the system', consultant_group_count;
        RAISE NOTICE 'Rolling back will remove the consultant management features';
        RAISE NOTICE 'but existing groups will continue to function normally.';
        RAISE NOTICE '';
        RAISE NOTICE 'To proceed with rollback, comment out this safety check.';
        RAISE EXCEPTION 'Rollback aborted for safety. Comment out this check to proceed.';
    END IF;
END $$;

-- ============================================
-- ROLLBACK MIGRATION
-- ============================================

-- Remove trigger first
DROP TRIGGER IF EXISTS update_group_assignment_settings_updated_at ON group_assignment_settings;

-- Remove policies
DROP POLICY IF EXISTS "Consultants can view assignment settings" ON group_assignment_settings;
DROP POLICY IF EXISTS "Consultants can manage assignment settings" ON group_assignment_settings;

-- Remove new table
DROP TABLE IF EXISTS group_assignment_settings;

-- Remove indexes
DROP INDEX IF EXISTS idx_group_assignment_groups_created_by;
DROP INDEX IF EXISTS idx_group_assignment_groups_consultant_managed;

-- Remove columns from existing table
ALTER TABLE group_assignment_groups 
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS is_consultant_managed,
  DROP COLUMN IF EXISTS max_members;

-- Remove function (only if not used elsewhere)
-- First check if it's used by other triggers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname != 'update_group_assignment_settings_updated_at' 
        AND tgfoid = 'update_updated_at_column'::regproc::oid
    ) THEN
        DROP FUNCTION IF EXISTS update_updated_at_column();
        RAISE NOTICE 'Dropped update_updated_at_column function';
    ELSE
        RAISE NOTICE 'Kept update_updated_at_column function (used by other triggers)';
    END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify columns were removed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'group_assignment_groups' 
        AND column_name IN ('created_by', 'is_consultant_managed', 'max_members')
    ) THEN
        RAISE NOTICE 'SUCCESS: Columns removed from group_assignment_groups table';
    ELSE
        RAISE EXCEPTION 'FAILED: Some columns still exist in group_assignment_groups table';
    END IF;

    -- Verify table was removed
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'group_assignment_settings'
    ) THEN
        RAISE NOTICE 'SUCCESS: group_assignment_settings table removed';
    ELSE
        RAISE EXCEPTION 'FAILED: group_assignment_settings table still exists';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== Rollback Complete ===';
    RAISE NOTICE 'The system has been restored to auto-grouping only mode';
    RAISE NOTICE 'All existing groups continue to function normally';
END $$;