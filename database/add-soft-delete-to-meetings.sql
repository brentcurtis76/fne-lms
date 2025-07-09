-- Add soft delete columns to community_meetings table
-- This allows meetings to be archived instead of permanently deleted

-- Add is_active column if it doesn't exist
ALTER TABLE community_meetings 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add deleted_at column if it doesn't exist
ALTER TABLE community_meetings 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add deleted_by column if it doesn't exist
ALTER TABLE community_meetings 
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Create index on is_active for performance
CREATE INDEX IF NOT EXISTS idx_community_meetings_is_active 
ON community_meetings(is_active) 
WHERE is_active = true;

-- Update existing RLS policies to respect soft delete
-- This ensures soft-deleted meetings are not shown to users

-- Drop existing select policy if it exists
DROP POLICY IF EXISTS "Users can view meetings in their workspaces" ON community_meetings;

-- Create new select policy that respects soft delete
CREATE POLICY "Users can view active meetings in their workspaces" ON community_meetings
  FOR SELECT
  USING (
    is_active = true 
    AND EXISTS (
      SELECT 1 FROM community_workspaces cw
      WHERE cw.id = community_meetings.workspace_id
      AND EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = cw.community_id
        AND cm.user_id = auth.uid()
        AND cm.is_active = true
      )
    )
  );

-- Comment on columns
COMMENT ON COLUMN community_meetings.is_active IS 'Soft delete flag - false means meeting is archived';
COMMENT ON COLUMN community_meetings.deleted_at IS 'Timestamp when meeting was soft deleted';
COMMENT ON COLUMN community_meetings.deleted_by IS 'User who soft deleted the meeting';