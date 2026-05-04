-- Extend group assignment RLS to allow a school fallback when community_id IS NULL.
--
-- Background: group_assignment_groups.community_id is now optional (see
-- 20260504000000_group_assignment_groups_optional_community.sql). Users with a
-- school role but no community role must still be able to manage and join
-- school-level groups. Existing admin and community-based branches are
-- preserved unchanged; we simply add a school fallback when the group has no
-- community context.
--
-- The migration is idempotent: each ALTER POLICY sets the full desired
-- expression, so re-running produces the same end state.

-- group_assignment_groups: SELECT --------------------------------------------

ALTER POLICY "Users can view groups in their community"
  ON group_assignment_groups
  USING (
    EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role_type = 'admin'::user_role_type
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.community_id = group_assignment_groups.community_id
         AND ur.is_active = true
    )
    OR (
      group_assignment_groups.community_id IS NULL
      AND EXISTS (
        SELECT 1
          FROM user_roles ur
         WHERE ur.user_id = auth.uid()
           AND ur.school_id = group_assignment_groups.school_id
           AND ur.is_active = true
      )
    )
  );

-- group_assignment_groups: INSERT --------------------------------------------

ALTER POLICY "Users can create groups in their community"
  ON group_assignment_groups
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role_type = 'admin'::user_role_type
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.community_id = group_assignment_groups.community_id
         AND ur.is_active = true
    )
    OR (
      group_assignment_groups.community_id IS NULL
      AND EXISTS (
        SELECT 1
          FROM user_roles ur
         WHERE ur.user_id = auth.uid()
           AND ur.school_id = group_assignment_groups.school_id
           AND ur.is_active = true
      )
    )
  );

-- group_assignment_groups: UPDATE --------------------------------------------

ALTER POLICY "Users can update groups in their community"
  ON group_assignment_groups
  USING (
    EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role_type = 'admin'::user_role_type
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.community_id = group_assignment_groups.community_id
         AND ur.is_active = true
    )
    OR (
      group_assignment_groups.community_id IS NULL
      AND EXISTS (
        SELECT 1
          FROM user_roles ur
         WHERE ur.user_id = auth.uid()
           AND ur.school_id = group_assignment_groups.school_id
           AND ur.is_active = true
      )
    )
  );

-- group_assignment_groups: DELETE --------------------------------------------

ALTER POLICY "Users can delete groups in their community"
  ON group_assignment_groups
  USING (
    EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role_type = 'admin'::user_role_type
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.community_id = group_assignment_groups.community_id
         AND ur.is_active = true
    )
    OR (
      group_assignment_groups.community_id IS NULL
      AND EXISTS (
        SELECT 1
          FROM user_roles ur
         WHERE ur.user_id = auth.uid()
           AND ur.school_id = group_assignment_groups.school_id
           AND ur.is_active = true
      )
    )
  );

-- group_assignment_members: INSERT (join) ------------------------------------

ALTER POLICY "Users can join groups in their community"
  ON group_assignment_members
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role_type = 'admin'::user_role_type
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM group_assignment_groups gag
        JOIN user_roles ur ON ur.community_id = gag.community_id
       WHERE gag.id = group_assignment_members.group_id
         AND ur.user_id = auth.uid()
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM group_assignment_groups gag
        JOIN user_roles ur ON ur.school_id = gag.school_id
       WHERE gag.id = group_assignment_members.group_id
         AND gag.community_id IS NULL
         AND ur.user_id = auth.uid()
         AND ur.is_active = true
    )
  );

-- group_assignment_members: UPDATE -------------------------------------------

ALTER POLICY "Users can update group memberships in their community"
  ON group_assignment_members
  USING (
    EXISTS (
      SELECT 1
        FROM user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role_type = 'admin'::user_role_type
         AND ur.is_active = true
    )
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM group_assignment_groups gag
        JOIN user_roles ur ON ur.community_id = gag.community_id
       WHERE gag.id = group_assignment_members.group_id
         AND ur.user_id = auth.uid()
         AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1
        FROM group_assignment_groups gag
        JOIN user_roles ur ON ur.school_id = gag.school_id
       WHERE gag.id = group_assignment_members.group_id
         AND gag.community_id IS NULL
         AND ur.user_id = auth.uid()
         AND ur.is_active = true
    )
  );
