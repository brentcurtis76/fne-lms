-- Create messaging system tables for FNE LMS
-- This creates the tables needed for the collaborative messaging feature

-- Create message_threads table
CREATE TABLE IF NOT EXISTS message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  thread_title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  custom_category_name VARCHAR(50),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  participant_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_message_threads_workspace ON message_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_category ON message_threads(category);
CREATE INDEX IF NOT EXISTS idx_message_threads_created_by ON message_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_message_threads_last_message ON message_threads(last_message_at DESC);

-- Create community_messages table
CREATE TABLE IF NOT EXISTS community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  reply_to_id UUID REFERENCES community_messages(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  content_html TEXT,
  message_type VARCHAR(50) DEFAULT 'regular',
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  mentions TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_messages_workspace ON community_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_thread ON community_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_author ON community_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_reply_to ON community_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_created ON community_messages(created_at DESC);

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id, reaction_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);

-- Create message_attachments table
CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);

-- Create thread_participants table
CREATE TABLE IF NOT EXISTS thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(thread_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_thread_participants_thread ON thread_participants(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_user ON thread_participants(user_id);

-- Enable Row Level Security
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for message_threads
CREATE POLICY "Users can view threads in their workspace" ON message_threads
  FOR SELECT USING (
    workspace_id IN (
      SELECT id FROM community_workspaces
      WHERE community_id IN (
        SELECT community_id FROM user_roles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create threads in their workspace" ON message_threads
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT id FROM community_workspaces
      WHERE community_id IN (
        SELECT community_id FROM user_roles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Thread creators can update their threads" ON message_threads
  FOR UPDATE USING (created_by = auth.uid());

-- RLS Policies for community_messages
CREATE POLICY "Users can view messages in their workspace" ON community_messages
  FOR SELECT USING (
    workspace_id IN (
      SELECT id FROM community_workspaces
      WHERE community_id IN (
        SELECT community_id FROM user_roles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create messages in their workspace" ON community_messages
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT id FROM community_workspaces
      WHERE community_id IN (
        SELECT community_id FROM user_roles
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Message authors can update their messages" ON community_messages
  FOR UPDATE USING (author_id = auth.uid());

-- RLS Policies for message_reactions
CREATE POLICY "Users can view reactions" ON message_reactions
  FOR SELECT USING (
    message_id IN (
      SELECT id FROM community_messages
      WHERE workspace_id IN (
        SELECT id FROM community_workspaces
        WHERE community_id IN (
          SELECT community_id FROM user_roles
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage their own reactions" ON message_reactions
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for message_attachments
CREATE POLICY "Users can view attachments in their workspace" ON message_attachments
  FOR SELECT USING (
    message_id IN (
      SELECT id FROM community_messages
      WHERE workspace_id IN (
        SELECT id FROM community_workspaces
        WHERE community_id IN (
          SELECT community_id FROM user_roles
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Message authors can create attachments" ON message_attachments
  FOR INSERT WITH CHECK (
    message_id IN (
      SELECT id FROM community_messages
      WHERE author_id = auth.uid()
    )
  );

-- RLS Policies for thread_participants
CREATE POLICY "Users can view thread participants" ON thread_participants
  FOR SELECT USING (
    thread_id IN (
      SELECT id FROM message_threads
      WHERE workspace_id IN (
        SELECT id FROM community_workspaces
        WHERE community_id IN (
          SELECT community_id FROM user_roles
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can join threads" ON thread_participants
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own participation" ON thread_participants
  FOR UPDATE USING (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON message_threads TO authenticated;
GRANT ALL ON community_messages TO authenticated;
GRANT ALL ON message_reactions TO authenticated;
GRANT ALL ON message_attachments TO authenticated;
GRANT ALL ON thread_participants TO authenticated;