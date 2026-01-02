-- ============================================================
-- 057_add_template_archive.sql
-- Adds archive functionality to assessment templates
--
-- Purpose: Allow templates to be archived instead of deleted
-- - Archived templates don't appear in active lists
-- - Archived templates don't create new instances
-- - Existing instances and responses remain intact
-- ============================================================

-- Add is_archived column to assessment_templates
ALTER TABLE assessment_templates
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Add archived_at timestamp
ALTER TABLE assessment_templates
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add archived_by (user who archived)
ALTER TABLE assessment_templates
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_assessment_templates_is_archived
ON assessment_templates(is_archived);

-- Add comments
COMMENT ON COLUMN assessment_templates.is_archived IS
'Whether the template is archived. Archived templates do not appear in active lists.';

COMMENT ON COLUMN assessment_templates.archived_at IS
'Timestamp when the template was archived.';

COMMENT ON COLUMN assessment_templates.archived_by IS
'User ID of who archived the template.';

-- Verify the changes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_templates'
    AND column_name = 'is_archived'
  ) THEN
    RAISE NOTICE 'Successfully added archive columns to assessment_templates';
  ELSE
    RAISE EXCEPTION 'Failed to add archive columns';
  END IF;
END;
$$;
