-- Add mentions support to messaging system
-- This migration adds support for storing and tracking mentions in messages

-- Add mentions column to community_messages table
ALTER TABLE community_messages 
ADD COLUMN IF NOT EXISTS mentions text[] DEFAULT '{}';

-- Create a mentions tracking table for quick lookups
CREATE TABLE IF NOT EXISTS message_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentioned_by_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(message_id, mentioned_user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_message_mentions_user ON message_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_workspace ON message_mentions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_thread ON message_mentions(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_unread ON message_mentions(mentioned_user_id, read_at) WHERE read_at IS NULL;

-- Add RLS policies for message_mentions
ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;

-- Users can see mentions where they are mentioned
CREATE POLICY "Users can view their own mentions" ON message_mentions
  FOR SELECT USING (mentioned_user_id = auth.uid());

-- Users can mark their own mentions as read
CREATE POLICY "Users can update their own mentions" ON message_mentions
  FOR UPDATE USING (mentioned_user_id = auth.uid())
  WITH CHECK (mentioned_user_id = auth.uid());

-- Message authors can create mentions
CREATE POLICY "Message authors can create mentions" ON message_mentions
  FOR INSERT WITH CHECK (mentioned_by_id = auth.uid());

-- Add a function to get unread mention count for a user
CREATE OR REPLACE FUNCTION get_unread_mention_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM message_mentions
    WHERE mentioned_user_id = p_user_id
      AND read_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a function to mark mentions as read
CREATE OR REPLACE FUNCTION mark_mentions_as_read(p_user_id UUID, p_message_ids UUID[])
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE message_mentions
  SET read_at = NOW()
  WHERE mentioned_user_id = p_user_id
    AND message_id = ANY(p_message_ids)
    AND read_at IS NULL;
    
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_unread_mention_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_mentions_as_read(UUID, UUID[]) TO authenticated;