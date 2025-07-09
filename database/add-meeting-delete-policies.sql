-- Add DELETE policies for meetings and related tables
-- This migration adds the missing DELETE policies that were causing meeting deletion to fail

-- 1. DELETE policy for community_meetings
CREATE POLICY IF NOT EXISTS "Meeting creators and authorized users can delete meetings" ON community_meetings
  FOR DELETE
  USING (
    created_by = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.role_type = 'admin'
      AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = community_meetings.workspace_id 
      AND ur.user_id = auth.uid() 
      AND ur.role_type = 'lider_comunidad'
      AND ur.is_active = true
    )
  );

-- 2. DELETE policy for meeting_attachments
CREATE POLICY IF NOT EXISTS "Users can delete attachments for deletable meetings" ON meeting_attachments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_attachments.meeting_id
      AND (
        cm.created_by = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid() 
          AND ur.role_type = 'admin'
          AND ur.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id 
          AND ur.user_id = auth.uid() 
          AND ur.role_type = 'lider_comunidad'
          AND ur.is_active = true
        )
      )
    )
  );

-- 3. DELETE policy for meeting_tasks
CREATE POLICY IF NOT EXISTS "Users can delete tasks for deletable meetings" ON meeting_tasks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_tasks.meeting_id
      AND (
        cm.created_by = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid() 
          AND ur.role_type = 'admin'
          AND ur.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id 
          AND ur.user_id = auth.uid() 
          AND ur.role_type = 'lider_comunidad'
          AND ur.is_active = true
        )
      )
    )
  );

-- 4. DELETE policy for meeting_commitments
CREATE POLICY IF NOT EXISTS "Users can delete commitments for deletable meetings" ON meeting_commitments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_commitments.meeting_id
      AND (
        cm.created_by = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid() 
          AND ur.role_type = 'admin'
          AND ur.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id 
          AND ur.user_id = auth.uid() 
          AND ur.role_type = 'lider_comunidad'
          AND ur.is_active = true
        )
      )
    )
  );

-- 5. DELETE policy for meeting_agreements
CREATE POLICY IF NOT EXISTS "Users can delete agreements for deletable meetings" ON meeting_agreements
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_agreements.meeting_id
      AND (
        cm.created_by = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid() 
          AND ur.role_type = 'admin'
          AND ur.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id 
          AND ur.user_id = auth.uid() 
          AND ur.role_type = 'lider_comunidad'
          AND ur.is_active = true
        )
      )
    )
  );

-- 6. DELETE policy for meeting_attendees
CREATE POLICY IF NOT EXISTS "Users can delete attendees for deletable meetings" ON meeting_attendees
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM community_meetings cm
      WHERE cm.id = meeting_attendees.meeting_id
      AND (
        cm.created_by = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid() 
          AND ur.role_type = 'admin'
          AND ur.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM community_workspaces cw
          JOIN user_roles ur ON ur.community_id = cw.community_id
          WHERE cw.id = cm.workspace_id 
          AND ur.user_id = auth.uid() 
          AND ur.role_type = 'lider_comunidad'
          AND ur.is_active = true
        )
      )
    )
  );

-- Comments
COMMENT ON POLICY "Meeting creators and authorized users can delete meetings" ON community_meetings 
IS 'Allows meeting creators, admins, and community leaders to delete meetings';

COMMENT ON POLICY "Users can delete attachments for deletable meetings" ON meeting_attachments 
IS 'Allows deletion of attachments when user has permission to delete the parent meeting';

COMMENT ON POLICY "Users can delete tasks for deletable meetings" ON meeting_tasks 
IS 'Allows deletion of tasks when user has permission to delete the parent meeting';

COMMENT ON POLICY "Users can delete commitments for deletable meetings" ON meeting_commitments 
IS 'Allows deletion of commitments when user has permission to delete the parent meeting';

COMMENT ON POLICY "Users can delete agreements for deletable meetings" ON meeting_agreements 
IS 'Allows deletion of agreements when user has permission to delete the parent meeting';

COMMENT ON POLICY "Users can delete attendees for deletable meetings" ON meeting_attendees 
IS 'Allows deletion of attendees when user has permission to delete the parent meeting';