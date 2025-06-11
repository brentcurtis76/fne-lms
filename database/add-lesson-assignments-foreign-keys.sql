-- Add foreign key constraints to lesson_assignments table
-- This assumes the table already exists but is missing proper relationships

-- First, check if columns exist (they should based on the successful query)
-- If any of these fail, it means the column doesn't exist

-- Add foreign key for course_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'lesson_assignments' 
    AND constraint_name = 'lesson_assignments_course_id_fkey'
  ) THEN
    ALTER TABLE lesson_assignments 
    ADD CONSTRAINT lesson_assignments_course_id_fkey 
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key for lesson_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'lesson_assignments' 
    AND constraint_name = 'lesson_assignments_lesson_id_fkey'
  ) THEN
    ALTER TABLE lesson_assignments 
    ADD CONSTRAINT lesson_assignments_lesson_id_fkey 
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key for created_by if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'lesson_assignments' 
    AND constraint_name = 'lesson_assignments_created_by_fkey'
  ) THEN
    ALTER TABLE lesson_assignments 
    ADD CONSTRAINT lesson_assignments_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key constraints to lesson_assignment_submissions table

-- Add foreign key for assignment_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'lesson_assignment_submissions' 
    AND constraint_name = 'lesson_assignment_submissions_assignment_id_fkey'
  ) THEN
    ALTER TABLE lesson_assignment_submissions 
    ADD CONSTRAINT lesson_assignment_submissions_assignment_id_fkey 
    FOREIGN KEY (assignment_id) REFERENCES lesson_assignments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key for student_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'lesson_assignment_submissions' 
    AND constraint_name = 'lesson_assignment_submissions_student_id_fkey'
  ) THEN
    ALTER TABLE lesson_assignment_submissions 
    ADD CONSTRAINT lesson_assignment_submissions_student_id_fkey 
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key for graded_by if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'lesson_assignment_submissions' 
    AND constraint_name = 'lesson_assignment_submissions_graded_by_fkey'
  ) THEN
    ALTER TABLE lesson_assignment_submissions 
    ADD CONSTRAINT lesson_assignment_submissions_graded_by_fkey 
    FOREIGN KEY (graded_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;