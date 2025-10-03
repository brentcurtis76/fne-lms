-- FIX: Correct role permissions for group assignments
-- Consultores are teachers, Docentes are students
-- v2: Handles view dependency

-- First, drop the view that depends on allow_self_grouping
DROP VIEW IF EXISTS group_assignments_with_stats CASCADE;

-- Drop existing policies that incorrectly give docentes teacher permissions
DROP POLICY IF EXISTS "teachers_manage_group_members" ON group_assignment_members;
DROP POLICY IF EXISTS "teachers_manage_group_submissions" ON group_assignment_submissions;
DROP POLICY IF EXISTS "teachers_manage_group_discussions" ON group_assignment_discussions;
DROP POLICY IF EXISTS "group_members_join_groups" ON group_assignment_members;

-- Remove self-grouping column since consultores assign groups manually
ALTER TABLE lesson_assignments 
DROP COLUMN IF EXISTS allow_self_grouping;

-- Recreate the view without the allow_self_grouping column
CREATE OR REPLACE VIEW group_assignments_with_stats AS
SELECT 
  la.*,
  gc.name as community_name,
  COUNT(DISTINCT gam.group_id) as group_count,
  COUNT(DISTINCT gam.user_id) as total_members,
  COUNT(DISTINCT gas.id) as submission_count,
  COUNT(DISTINCT CASE WHEN gas.status = 'graded' THEN gas.id END) as graded_count
FROM lesson_assignments la
LEFT JOIN growth_communities gc ON la.assigned_to_community_id = gc.id
LEFT JOIN group_assignment_members gam ON la.id = gam.assignment_id
LEFT JOIN group_assignment_submissions gas ON la.id = gas.assignment_id
WHERE la.assignment_for = 'group'
GROUP BY la.id, gc.name;

-- Create corrected RLS policies

-- Policy: Only consultores and admin can manage group members
CREATE POLICY "consultores_manage_group_members"
  ON group_assignment_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor')
    )
  );

-- Policy: Students (docentes) can only view their own group memberships
CREATE POLICY "students_view_own_group_membership"
  ON group_assignment_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_members.group_id
      AND gam.user_id = auth.uid()
    )
  );

-- Policy: Only consultores and admin can manage submissions (grade, return)
CREATE POLICY "consultores_manage_submissions"
  ON group_assignment_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor')
    )
  );

-- Policy: Students can view and create/update their group's submissions
CREATE POLICY "students_manage_own_submissions"
  ON group_assignment_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_submissions.group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "students_create_submissions"
  ON group_assignment_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "students_update_draft_submissions"
  ON group_assignment_submissions FOR UPDATE
  USING (
    status IN ('draft', 'returned') AND
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_submissions.group_id
      AND gam.user_id = auth.uid()
    )
  );

-- Policy: Only consultores and admin can manage discussions
CREATE POLICY "consultores_manage_discussions"
  ON group_assignment_discussions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor')
    )
  );

-- Policy: Students can view and participate in their group discussions
CREATE POLICY "students_view_discussions"
  ON group_assignment_discussions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_discussions.group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "students_create_discussions"
  ON group_assignment_discussions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_id
      AND gam.user_id = auth.uid()
    )
  );

-- Update lesson_assignments RLS to only allow consultores/admin to create
DROP POLICY IF EXISTS "Teachers can create assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers can update assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers can delete assignments" ON lesson_assignments;

CREATE POLICY "consultores_create_assignments"
  ON lesson_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor')
    )
  );

CREATE POLICY "consultores_update_assignments"
  ON lesson_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor')
    )
  );

CREATE POLICY "consultores_delete_assignments"
  ON lesson_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor')
    )
  );

-- Everyone can view assignments (students need to see their assignments)
CREATE POLICY "all_users_view_assignments"
  ON lesson_assignments FOR SELECT
  USING (auth.role() = 'authenticated');