-- Add missing category column to courses table
-- This column is expected by the application but was missing from the schema

ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);

-- Update any existing courses to have a default category
UPDATE courses SET category = 'general' WHERE category IS NULL;