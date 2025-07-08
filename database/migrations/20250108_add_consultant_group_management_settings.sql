-- Migration: Add consultant group management settings
-- Created: 2025-01-08
-- Description: Adds support for consultant-managed group creation alongside existing auto-grouping
-- This is a non-breaking change that preserves all existing functionality

-- ============================================
-- UP MIGRATION
-- ============================================

-- Add consultant management fields to existing group_assignment_groups table
-- These are all nullable/defaulted to maintain backward compatibility
ALTER TABLE group_assignment_groups 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_consultant_managed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 8 
    CHECK (max_members >= 2 AND max_members <= 8);

-- Create new table for per-assignment settings
CREATE TABLE IF NOT EXISTS group_assignment_settings (
  assignment_id TEXT PRIMARY KEY,
  consultant_managed BOOLEAN DEFAULT FALSE,
  min_group_size INTEGER DEFAULT 2 CHECK (min_group_size >= 2),
  max_group_size INTEGER DEFAULT 8 CHECK (max_group_size <= 8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_group_size CHECK (min_group_size <= max_group_size)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_created_by 
  ON group_assignment_groups(created_by) 
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_consultant_managed 
  ON group_assignment_groups(is_consultant_managed) 
  WHERE is_consultant_managed = TRUE;

CREATE INDEX IF NOT EXISTS idx_group_assignment_settings_consultant_managed 
  ON group_assignment_settings(consultant_managed) 
  WHERE consultant_managed = TRUE;

-- Add RLS policies for the new table
ALTER TABLE group_assignment_settings ENABLE ROW LEVEL SECURITY;

-- Consultants can view settings for assignments in their communities
CREATE POLICY "Consultants can view assignment settings" ON group_assignment_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultant_assignments ca
      WHERE ca.consultant_id = auth.uid()
      AND ca.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Consultants can create/update settings for assignments
CREATE POLICY "Consultants can manage assignment settings" ON group_assignment_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM consultant_assignments ca
      WHERE ca.consultant_id = auth.uid()
      AND ca.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Add update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_group_assignment_settings_updated_at 
  BEFORE UPDATE ON group_assignment_settings 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE group_assignment_settings IS 'Stores per-assignment configuration for consultant-managed group creation';
COMMENT ON COLUMN group_assignment_settings.consultant_managed IS 'When TRUE, groups must be created by consultants; when FALSE, uses auto-grouping';
COMMENT ON COLUMN group_assignment_groups.created_by IS 'User who created this group (consultant for managed groups, NULL for auto-created)';
COMMENT ON COLUMN group_assignment_groups.is_consultant_managed IS 'TRUE if this group was created by a consultant, FALSE for auto-created groups';
COMMENT ON COLUMN group_assignment_groups.max_members IS 'Maximum number of members allowed in this group';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify the migration was successful
DO $$
BEGIN
    -- Check if columns were added to group_assignment_groups
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'group_assignment_groups' 
        AND column_name IN ('created_by', 'is_consultant_managed', 'max_members')
    ) THEN
        RAISE NOTICE 'SUCCESS: Columns added to group_assignment_groups table';
    ELSE
        RAISE EXCEPTION 'FAILED: Columns not added to group_assignment_groups table';
    END IF;

    -- Check if group_assignment_settings table was created
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'group_assignment_settings'
    ) THEN
        RAISE NOTICE 'SUCCESS: group_assignment_settings table created';
    ELSE
        RAISE EXCEPTION 'FAILED: group_assignment_settings table not created';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== Consultant Group Management Migration Complete ===';
    RAISE NOTICE 'The system now supports both auto-grouping and consultant-managed groups';
    RAISE NOTICE 'Existing groups remain unchanged and continue to work as before';
END $$;

-- ============================================
-- DOWN MIGRATION (for rollback)
-- ============================================
/*
To rollback this migration, run the following SQL:

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
    END IF;
END $$;

*/