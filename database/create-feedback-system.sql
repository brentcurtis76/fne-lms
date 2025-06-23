-- ===============================================
-- FNE LMS Platform Feedback System
-- ===============================================
-- Simple system for users to report issues and ideas
-- Focuses on ease of use and minimal friction
-- ===============================================

BEGIN;

-- Create feedback types enum
CREATE TYPE feedback_type AS ENUM ('bug', 'idea', 'feedback');
CREATE TYPE feedback_status AS ENUM ('new', 'seen', 'in_progress', 'resolved', 'closed');

-- Main feedback table
CREATE TABLE IF NOT EXISTS platform_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT, -- Optional title
  description TEXT NOT NULL,
  type feedback_type DEFAULT 'feedback',
  status feedback_status DEFAULT 'new',
  
  -- Technical context (auto-captured)
  page_url TEXT,
  user_agent TEXT,
  browser_info JSONB, -- Store detailed browser/device info
  
  -- Screenshot attachment
  screenshot_url TEXT,
  screenshot_filename TEXT,
  
  -- User tracking
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Resolution tracking
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  
  -- Metadata
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Gamification fields (for future use)
  helpful_count INTEGER DEFAULT 0, -- For future voting
  is_public BOOLEAN DEFAULT FALSE -- For future public roadmap
);

-- Activity/comments table
CREATE TABLE IF NOT EXISTS feedback_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID REFERENCES platform_feedback(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_system_message BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_platform_feedback_status ON platform_feedback(status);
CREATE INDEX idx_platform_feedback_type ON platform_feedback(type);
CREATE INDEX idx_platform_feedback_created_by ON platform_feedback(created_by);
CREATE INDEX idx_platform_feedback_created_at ON platform_feedback(created_at DESC);
CREATE INDEX idx_feedback_activity_feedback_id ON feedback_activity(feedback_id);

-- Enable RLS
ALTER TABLE platform_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for platform_feedback
-- Users can view their own feedback
CREATE POLICY "Users can view own feedback" ON platform_feedback
  FOR SELECT USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Users can create feedback
CREATE POLICY "Users can create feedback" ON platform_feedback
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
  );

-- Only admins can update feedback
CREATE POLICY "Admins can update feedback" ON platform_feedback
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Only admins can delete feedback
CREATE POLICY "Admins can delete feedback" ON platform_feedback
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- RLS Policies for feedback_activity
-- Users can view activity on feedback they can see
CREATE POLICY "Users can view feedback activity" ON feedback_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM platform_feedback pf
      WHERE pf.id = feedback_activity.feedback_id
      AND (
        pf.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
          AND role = 'admin'
        )
      )
    )
  );

-- Users can comment on their own feedback, admins on any
CREATE POLICY "Users can create feedback activity" ON feedback_activity
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM platform_feedback pf
      WHERE pf.id = feedback_activity.feedback_id
      AND (
        pf.created_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE id = auth.uid() 
          AND role = 'admin'
        )
      )
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_platform_feedback_updated_at
  BEFORE UPDATE ON platform_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

-- Function to create system activity when status changes
CREATE OR REPLACE FUNCTION log_feedback_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO feedback_activity (
      feedback_id,
      message,
      is_system_message,
      created_by
    ) VALUES (
      NEW.id,
      'Estado cambiado de ' || OLD.status || ' a ' || NEW.status,
      true,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for status change logging
CREATE TRIGGER log_feedback_status_change_trigger
  AFTER UPDATE ON platform_feedback
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_feedback_status_change();

-- Grant necessary permissions
GRANT USAGE ON TYPE feedback_type TO authenticated;
GRANT USAGE ON TYPE feedback_status TO authenticated;

-- Create view for admin dashboard stats
CREATE OR REPLACE VIEW feedback_stats AS
SELECT 
  COUNT(*) FILTER (WHERE status = 'new') as new_count,
  COUNT(*) FILTER (WHERE status = 'seen') as seen_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
  COUNT(*) FILTER (WHERE type = 'bug') as bug_count,
  COUNT(*) FILTER (WHERE type = 'idea') as idea_count,
  COUNT(*) FILTER (WHERE type = 'feedback') as feedback_count,
  COUNT(*) as total_count
FROM platform_feedback;

-- Grant access to the stats view
GRANT SELECT ON feedback_stats TO authenticated;

-- Add helpful comments
COMMENT ON TABLE platform_feedback IS 'User-submitted feedback, bugs, and feature requests';
COMMENT ON TABLE feedback_activity IS 'Comments and activity log for feedback items';
COMMENT ON COLUMN platform_feedback.type IS 'Type of feedback: bug, idea, or general feedback';
COMMENT ON COLUMN platform_feedback.status IS 'Current status: new, seen, in_progress, resolved, closed';
COMMENT ON COLUMN platform_feedback.browser_info IS 'JSON object with detailed browser and device information';

COMMIT;