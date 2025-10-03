-- SIMPLIFY GROUP ASSIGNMENTS - Single Table Approach
-- This migration simplifies the group assignment system to use only the lesson_assignments table

-- Step 1: Add group_assignments JSON column to store group data
ALTER TABLE lesson_assignments 
ADD COLUMN IF NOT EXISTS group_assignments JSONB DEFAULT '[]'::jsonb;

-- The JSON structure will be:
-- [
--   {
--     "group_id": "uuid",
--     "group_name": "Grupo 1",
--     "members": [
--       {"user_id": "uuid", "name": "Student Name", "email": "email@example.com"},
--       {"user_id": "uuid", "name": "Student Name", "email": "email@example.com"}
--     ],
--     "submission": {
--       "submitted_by": "uuid",
--       "submitted_at": "timestamp",
--       "file_url": "storage_url",
--       "status": "submitted"
--     }
--   }
-- ]

-- Step 2: Update assignment_type column (ensure it exists)
ALTER TABLE lesson_assignments 
ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'individual' 
CHECK (assignment_type IN ('individual', 'group'));

-- Step 3: Create function to get user's group assignments
CREATE OR REPLACE FUNCTION get_user_group_assignments(p_user_id UUID, p_community_id UUID)
RETURNS TABLE (
  assignment_id UUID,
  title TEXT,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  points INTEGER,
  course_id UUID,
  lesson_id UUID,
  group_data JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    la.id,
    la.title,
    la.description,
    la.due_date,
    la.points,
    la.course_id,
    la.lesson_id,
    jsonb_path_query_first(
      la.group_assignments,
      '$[*] ? (@.members[*].user_id == $user_id)',
      jsonb_build_object('user_id', p_user_id::text)
    ) as group_data
  FROM lesson_assignments la
  WHERE la.assignment_type = 'group'
    AND la.assigned_to_community_id = p_community_id
    AND la.is_published = true
    AND jsonb_path_exists(
      la.group_assignments,
      '$[*] ? (@.members[*].user_id == $user_id)',
      jsonb_build_object('user_id', p_user_id::text)
    );
END;
$$;

-- Step 4: Update RLS policies for simplified approach
DROP POLICY IF EXISTS "all_users_view_assignments" ON lesson_assignments;

CREATE POLICY "users_view_assignments"
  ON lesson_assignments FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      -- Individual assignments
      assignment_type = 'individual' OR
      -- Group assignments where user is a member
      (assignment_type = 'group' AND 
       jsonb_path_exists(
         group_assignments,
         '$[*] ? (@.members[*].user_id == $user_id)',
         jsonb_build_object('user_id', auth.uid()::text)
       )
      ) OR
      -- Consultores can see all assignments
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'consultor')
      )
    )
  );

-- Step 5: Clean up - Remove complex tables (DO NOT RUN IN PRODUCTION WITHOUT BACKUP)
-- Commented out for safety - run manually after confirming data migration
-- DROP TABLE IF EXISTS group_assignment_discussions CASCADE;
-- DROP TABLE IF EXISTS group_assignment_submissions CASCADE;
-- DROP TABLE IF EXISTS group_assignment_members CASCADE;

-- Step 6: Remove unused columns
-- ALTER TABLE lesson_assignments DROP COLUMN IF EXISTS allow_self_grouping;
-- ALTER TABLE lesson_assignments DROP COLUMN IF EXISTS require_all_members_submit;

COMMENT ON COLUMN lesson_assignments.group_assignments IS 'JSON array of groups with members and submissions for group assignments';