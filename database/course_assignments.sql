-- Course Assignments Table
-- This table tracks which teachers have access to which courses
-- MVP Phase 1: Individual teacher assignments only

CREATE TABLE IF NOT EXISTS course_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure no duplicate assignments
  UNIQUE(course_id, teacher_id)
);

-- Add RLS policies
ALTER TABLE course_assignments ENABLE ROW LEVEL SECURITY;

-- Teachers can read their own assignments
CREATE POLICY "Teachers can view their own course assignments" ON course_assignments
  FOR SELECT USING (teacher_id = auth.uid());

-- Admins can manage all assignments
CREATE POLICY "Admins can manage course assignments" ON course_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_assignments_teacher_id ON course_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_assignments_course_id ON course_assignments(course_id);