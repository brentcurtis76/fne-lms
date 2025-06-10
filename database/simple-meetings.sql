-- Simple Meeting System for FNE LMS
-- This is a simplified version that doesn't require the full workspace infrastructure

-- 1. Create a simple meetings table
CREATE TABLE IF NOT EXISTS simple_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL, -- Simple text field for workspace reference
  title TEXT NOT NULL,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  facilitator_id UUID REFERENCES profiles(id),
  secretary_id UUID REFERENCES profiles(id),
  summary TEXT,
  notes TEXT,
  status TEXT DEFAULT 'completada',
  created_by UUID NOT NULL REFERENCES profiles(id),
  
  -- Store all meeting data as JSON for simplicity
  meeting_data JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_simple_meetings_workspace ON simple_meetings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_simple_meetings_created_by ON simple_meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_simple_meetings_date ON simple_meetings(meeting_date);

-- 3. Enable RLS
ALTER TABLE simple_meetings ENABLE ROW LEVEL SECURITY;

-- 4. Create simple policies - all authenticated users can CRUD their own meetings
CREATE POLICY "Users can view all meetings" ON simple_meetings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create meetings" ON simple_meetings
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own meetings" ON simple_meetings
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own meetings" ON simple_meetings
  FOR DELETE
  USING (auth.uid() = created_by);

-- 5. Create a function to migrate simple meetings to full system later
CREATE OR REPLACE FUNCTION migrate_simple_meeting_to_full(
  p_simple_meeting_id UUID
) RETURNS UUID AS $$
DECLARE
  v_meeting_data JSONB;
  v_new_meeting_id UUID;
BEGIN
  -- This function can be implemented later when the full meeting system is set up
  -- For now, just return the simple meeting ID
  RETURN p_simple_meeting_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE simple_meetings IS 'Simplified meeting storage for quick implementation';
COMMENT ON COLUMN simple_meetings.meeting_data IS 'Stores agreements, commitments, tasks, and attendees as JSON';