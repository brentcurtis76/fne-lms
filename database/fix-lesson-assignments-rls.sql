-- Fix RLS policies for lesson_assignments and lesson_assignment_submissions tables
-- This script updates the RLS policies to work with the renamed tables

-- First, enable RLS on both tables if not already enabled
ALTER TABLE lesson_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies (if they exist) to start fresh
DROP POLICY IF EXISTS "Published assignments are viewable by all authenticated users" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers and above can create assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Assignment creators can update their own assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Assignment creators can view all their assignments" ON lesson_assignments;

DROP POLICY IF EXISTS "Students can view their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Teachers can view submissions for their assignments" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Students can create their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Students can update their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Teachers can grade submissions" ON lesson_assignment_submissions;

-- LESSON_ASSIGNMENTS TABLE POLICIES

-- Policy: Anyone can view published assignments
CREATE POLICY "Published assignments are viewable by all authenticated users" 
  ON lesson_assignments FOR SELECT 
  USING (is_published = true AND auth.role() = 'authenticated');

-- Policy: Assignment creators can view all their assignments (including drafts)
CREATE POLICY "Assignment creators can view all their assignments" 
  ON lesson_assignments FOR SELECT 
  USING (created_by = auth.uid());

-- Policy: Teachers and above can create assignments
CREATE POLICY "Teachers and above can create assignments" 
  ON lesson_assignments FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'consultor', 'equipo_directivo', 'lider_generacion')
    )
  );

-- Policy: Assignment creators can update their own assignments
CREATE POLICY "Assignment creators can update their own assignments" 
  ON lesson_assignments FOR UPDATE 
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy: Admins can delete assignments
CREATE POLICY "Admins can delete assignments" 
  ON lesson_assignments FOR DELETE 
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- LESSON_ASSIGNMENT_SUBMISSIONS TABLE POLICIES

-- Policy: Students can view their own submissions
CREATE POLICY "Students can view their own submissions" 
  ON lesson_assignment_submissions FOR SELECT 
  USING (student_id = auth.uid());

-- Policy: Teachers can view submissions for their assignments
CREATE POLICY "Teachers can view submissions for their assignments" 
  ON lesson_assignment_submissions FOR SELECT 
  USING (
    assignment_id IN (
      SELECT id FROM lesson_assignments 
      WHERE created_by = auth.uid()
    )
  );

-- Policy: Students can create their own submissions
CREATE POLICY "Students can create their own submissions" 
  ON lesson_assignment_submissions FOR INSERT 
  WITH CHECK (
    student_id = auth.uid() 
    AND auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('lider_comunidad', 'docente')
    )
  );

-- Policy: Students can update their own submissions (only if not graded)
CREATE POLICY "Students can update their own submissions" 
  ON lesson_assignment_submissions FOR UPDATE 
  USING (student_id = auth.uid() AND status IN ('draft', 'submitted'))
  WITH CHECK (student_id = auth.uid());

-- Policy: Teachers can update submissions (for grading)
CREATE POLICY "Teachers can grade submissions" 
  ON lesson_assignment_submissions FOR UPDATE 
  USING (
    assignment_id IN (
      SELECT id FROM lesson_assignments 
      WHERE created_by = auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON TABLE lesson_assignments IS 'Stores individual assignments created by teachers';
COMMENT ON TABLE lesson_assignment_submissions IS 'Stores student submissions for assignments';
COMMENT ON COLUMN lesson_assignments.assignment_type IS 'Type of assignment: task, quiz, project, etc.';
COMMENT ON COLUMN lesson_assignment_submissions.status IS 'Submission status: draft, submitted, graded, returned';

-- Grant necessary permissions
GRANT ALL ON lesson_assignments TO authenticated;
GRANT ALL ON lesson_assignment_submissions TO authenticated;