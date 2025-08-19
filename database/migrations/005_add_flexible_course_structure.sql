-- Migration: Add flexible course structure support
-- Allows courses to have lessons directly (simple) or through modules (structured)
-- Date: 2025-08-18

-- Step 1: Add structure_type column to courses table
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS structure_type VARCHAR(20) DEFAULT 'structured' 
CHECK (structure_type IN ('simple', 'structured'));

-- Step 2: Update all existing courses to 'structured' type (they all have modules currently)
UPDATE courses 
SET structure_type = 'structured' 
WHERE structure_type IS NULL;

-- Step 3: Ensure all lessons have course_id populated
-- For lessons with module_id, get course_id from their module
UPDATE lessons l
SET course_id = m.course_id
FROM modules m
WHERE l.module_id = m.id
AND l.course_id IS NULL;

-- Step 4: Add comment to explain the structure types
COMMENT ON COLUMN courses.structure_type IS 'Determines course organization: simple (direct lessons) or structured (with modules)';

-- Step 5: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_courses_structure_type ON courses(structure_type);

-- Step 6: Add a check to ensure lessons have proper relationships
-- Either module_id (for structured courses) or just course_id (for simple courses)
-- But course_id should always be present
ALTER TABLE lessons 
ADD CONSTRAINT check_lesson_course_relationship 
CHECK (course_id IS NOT NULL);

-- Step 7: Create a function to validate course structure consistency
CREATE OR REPLACE FUNCTION validate_course_structure()
RETURNS TRIGGER AS $$
BEGIN
  -- For structured courses, lessons should have module_id
  -- For simple courses, lessons should NOT have module_id
  IF NEW.module_id IS NOT NULL THEN
    -- Ensure the course is structured type
    IF NOT EXISTS (
      SELECT 1 FROM modules m 
      JOIN courses c ON c.id = m.course_id 
      WHERE m.id = NEW.module_id 
      AND c.structure_type = 'structured'
    ) THEN
      RAISE EXCEPTION 'Cannot add lesson with module to a simple course';
    END IF;
  END IF;
  
  -- If course_id is provided directly, ensure it matches module's course if module exists
  IF NEW.module_id IS NOT NULL AND NEW.course_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM modules m 
      WHERE m.id = NEW.module_id 
      AND m.course_id = NEW.course_id
    ) THEN
      RAISE EXCEPTION 'Lesson course_id does not match module course_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger for validation
DROP TRIGGER IF EXISTS validate_lesson_structure ON lessons;
CREATE TRIGGER validate_lesson_structure
BEFORE INSERT OR UPDATE ON lessons
FOR EACH ROW
EXECUTE FUNCTION validate_course_structure();

-- Step 9: Create helper function to get course structure info
CREATE OR REPLACE FUNCTION get_course_structure_info(p_course_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'course_id', c.id,
    'title', c.title,
    'structure_type', c.structure_type,
    'module_count', COALESCE(module_stats.count, 0),
    'direct_lesson_count', COALESCE(direct_lessons.count, 0),
    'total_lesson_count', COALESCE(all_lessons.count, 0)
  ) INTO v_result
  FROM courses c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as count 
    FROM modules 
    WHERE course_id = c.id
  ) module_stats ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as count 
    FROM lessons 
    WHERE course_id = c.id 
    AND module_id IS NULL
  ) direct_lessons ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as count 
    FROM lessons 
    WHERE course_id = c.id
  ) all_lessons ON true
  WHERE c.id = p_course_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_course_structure_info(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_course_structure() TO authenticated;