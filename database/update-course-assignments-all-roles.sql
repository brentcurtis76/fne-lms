-- Update Course Assignments to Allow All Roles
-- This migration updates the RLS policies to allow any authenticated user
-- to view their course assignments, not just teachers (docentes)

-- Drop the existing policy that restricts to teachers only
DROP POLICY IF EXISTS "Teachers can view their own course assignments" ON course_assignments;

-- Create a new policy that allows any authenticated user to view their assignments
CREATE POLICY "Users can view their own course assignments" ON course_assignments
  FOR SELECT USING (teacher_id = auth.uid());

-- Optional: Add a comment to clarify the column usage
COMMENT ON COLUMN course_assignments.teacher_id IS 'ID of the user assigned to the course (can be any role: admin, consultor, docente, etc.)';

-- Add an index to improve query performance for all users
CREATE INDEX IF NOT EXISTS idx_course_assignments_teacher_role ON course_assignments(teacher_id);

-- Create a view to make it easier to query course assignments with user details
CREATE OR REPLACE VIEW course_assignments_with_users AS
SELECT 
  ca.*,
  p.email as user_email,
  p.first_name as user_first_name,
  p.last_name as user_last_name,
  p.role as user_role,
  p.school as user_school,
  c.title as course_title,
  c.description as course_description
FROM course_assignments ca
JOIN profiles p ON p.id = ca.teacher_id
JOIN courses c ON c.id = ca.course_id
WHERE ca.teacher_id = auth.uid() OR EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() 
  AND profiles.role = 'admin'
);

-- Grant access to the view
GRANT SELECT ON course_assignments_with_users TO authenticated;