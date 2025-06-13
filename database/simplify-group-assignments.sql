-- Simplify group assignments implementation
-- This migration simplifies the group assignment feature to use a single table approach

-- Step 1: Add new columns to lesson_assignments table
ALTER TABLE lesson_assignments 
ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'individual' CHECK (assignment_type IN ('individual', 'group')),
ADD COLUMN IF NOT EXISTS group_assignments JSONB DEFAULT '[]'::jsonb;

-- The group_assignments JSON structure will be:
-- [
--   {
--     "group_id": "uuid",
--     "group_name": "Group 1",
--     "members": [
--       {"user_id": "uuid", "full_name": "Student Name"},
--       {"user_id": "uuid", "full_name": "Another Student"}
--     ],
--     "submission": {
--       "file_url": "url",
--       "submitted_at": "timestamp",
--       "submitted_by": "user_id"
--     }
--   }
-- ]

-- Step 2: Drop the complex group assignment tables if they exist
DROP TABLE IF EXISTS group_assignment_discussions CASCADE;
DROP TABLE IF EXISTS group_assignment_submissions CASCADE;
DROP TABLE IF EXISTS group_assignment_members CASCADE;

-- Step 3: Remove unnecessary columns from lesson_assignments
ALTER TABLE lesson_assignments 
DROP COLUMN IF EXISTS assignment_for,
DROP COLUMN IF EXISTS assigned_to_community_id,
DROP COLUMN IF EXISTS max_group_size,
DROP COLUMN IF EXISTS min_group_size,
DROP COLUMN IF EXISTS allow_self_grouping,
DROP COLUMN IF EXISTS require_all_members_submit;

-- Step 4: Create a simple function to check if a user is in a group assignment
CREATE OR REPLACE FUNCTION user_in_group_assignment(assignment_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM lesson_assignments la,
    jsonb_array_elements(la.group_assignments) as group_data,
    jsonb_array_elements(group_data->'members') as member
    WHERE la.id = assignment_id
    AND la.assignment_type = 'group'
    AND member->>'user_id' = user_id::text
  );
END;
$$ LANGUAGE plpgsql;

-- Step 5: Update RLS policies for the simplified approach
-- Allow students to view group assignments they're part of
CREATE POLICY "students_view_group_assignments" 
  ON lesson_assignments FOR SELECT
  USING (
    assignment_type = 'individual' OR
    (assignment_type = 'group' AND user_in_group_assignment(id, auth.uid()))
  );

-- Allow consultores to create and update group assignments
CREATE POLICY "consultores_manage_group_assignments"
  ON lesson_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'consultor')
    )
  );

-- Step 6: Create helper view for group assignments
CREATE OR REPLACE VIEW v_group_assignments AS
SELECT 
  la.id,
  la.title,
  la.description,
  la.due_date,
  la.course_id,
  la.lesson_id,
  la.assignment_type,
  la.created_at,
  jsonb_array_length(la.group_assignments) as group_count,
  la.group_assignments
FROM lesson_assignments la
WHERE la.assignment_type = 'group';

-- Step 7: Create function to update group submission
CREATE OR REPLACE FUNCTION update_group_submission(
  p_assignment_id UUID,
  p_group_id UUID,
  p_file_url TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_groups JSONB;
  v_updated_groups JSONB = '[]'::jsonb;
  v_group JSONB;
BEGIN
  -- Get current groups
  SELECT group_assignments INTO v_groups
  FROM lesson_assignments
  WHERE id = p_assignment_id;
  
  -- Update the specific group's submission
  FOR v_group IN SELECT * FROM jsonb_array_elements(v_groups)
  LOOP
    IF v_group->>'group_id' = p_group_id::text THEN
      -- Update this group's submission
      v_group = jsonb_set(
        v_group, 
        '{submission}', 
        jsonb_build_object(
          'file_url', p_file_url,
          'submitted_at', now(),
          'submitted_by', p_user_id
        )
      );
    END IF;
    v_updated_groups = v_updated_groups || v_group;
  END LOOP;
  
  -- Update the assignment
  UPDATE lesson_assignments
  SET group_assignments = v_updated_groups,
      updated_at = now()
  WHERE id = p_assignment_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_lesson_assignments_type ON lesson_assignments(assignment_type);
CREATE INDEX IF NOT EXISTS idx_lesson_assignments_groups ON lesson_assignments USING gin(group_assignments);

-- Add comments for documentation
COMMENT ON COLUMN lesson_assignments.assignment_type IS 'Type of assignment: individual or group';
COMMENT ON COLUMN lesson_assignments.group_assignments IS 'JSON array containing group information and submissions';