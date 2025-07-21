-- Add missing columns that the application expects but are not in the schema

-- Add duration_hours column (different from estimated_duration_hours)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration_hours INTEGER;

-- Add is_published column (currently using status instead)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Update is_published based on existing status
UPDATE courses SET is_published = (status = 'published') WHERE is_published IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_duration_hours ON courses(duration_hours);
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON courses(is_published);

-- Add comments to clarify the difference
COMMENT ON COLUMN courses.duration_hours IS 'Duration in hours for learning paths (may differ from estimated_duration_hours)';
COMMENT ON COLUMN courses.estimated_duration_hours IS 'Estimated completion time in hours';
COMMENT ON COLUMN courses.is_published IS 'Whether course is published (derived from status for compatibility)';