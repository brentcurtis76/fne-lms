-- Simple migration to add structure_type column
-- Run this in Supabase SQL Editor

-- Add structure_type column to courses table
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS structure_type VARCHAR(20) DEFAULT 'structured' 
CHECK (structure_type IN ('simple', 'structured'));

-- Update all existing courses to 'structured' type
UPDATE courses 
SET structure_type = 'structured' 
WHERE structure_type IS NULL;

-- Add comment to explain the structure types
COMMENT ON COLUMN courses.structure_type IS 'Determines course organization: simple (direct lessons) or structured (with modules)';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_courses_structure_type ON courses(structure_type);