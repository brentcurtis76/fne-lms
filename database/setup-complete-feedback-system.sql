-- ===============================================
-- Complete Feedback System Setup
-- ===============================================
-- This script sets up the entire feedback system in correct order
-- Run this in Supabase SQL Editor if components are missing
-- ===============================================

-- STEP 1: Create main feedback system tables and functions
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
CREATE INDEX IF NOT EXISTS idx_platform_feedback_status ON platform_feedback(status);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_type ON platform_feedback(type);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_created_by ON platform_feedback(created_by);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_created_at ON platform_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_activity_feedback_id ON feedback_activity(feedback_id);

-- Enable RLS
ALTER TABLE platform_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_activity ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Users can create feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Admins can update feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Admins can delete feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Users can view feedback activity" ON feedback_activity;
DROP POLICY IF EXISTS "Users can create feedback activity" ON feedback_activity;

-- RLS Policies for platform_feedback
CREATE POLICY "Users can view own feedback" ON platform_feedback
  FOR SELECT USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Users can create feedback" ON platform_feedback
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
  );

CREATE POLICY "Admins can update feedback" ON platform_feedback
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete feedback" ON platform_feedback
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- RLS Policies for feedback_activity
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
DROP TRIGGER IF EXISTS update_platform_feedback_updated_at ON platform_feedback;
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
DROP TRIGGER IF EXISTS log_feedback_status_change_trigger ON platform_feedback;
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

COMMIT;

-- STEP 2: Setup storage bucket and policies
-- ===============================================

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  true, -- Public bucket for easy viewing
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Drop existing storage policies to avoid conflicts
DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

-- Create storage policies
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'feedback-screenshots' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = 'feedback' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'feedback-screenshots');

CREATE POLICY "Users can update own feedback screenshots"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'feedback-screenshots' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

CREATE POLICY "Users can delete own feedback screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'feedback-screenshots' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Grant necessary permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- STEP 3: Setup notification integration
-- ===============================================

-- Add the new event type to the notification system
INSERT INTO notification_triggers (
  event_type,
  is_active,
  created_at
) VALUES (
  'new_feedback',
  true,
  NOW()
) ON CONFLICT (event_type) DO NOTHING;

-- Create notification template for new feedback
INSERT INTO notification_templates (
  trigger_id,
  title_template,
  description_template,
  url_template,
  category,
  importance,
  created_at
) VALUES (
  (SELECT trigger_id FROM notification_triggers WHERE event_type = 'new_feedback'),
  'Nuevo Feedback: {feedback_type}',
  '{user_name} ha enviado un reporte: {description}',
  '/admin/feedback',
  'system',
  'normal',
  NOW()
) ON CONFLICT DO NOTHING;

-- STEP 4: Final verification and output
-- ===============================================

DO $$
DECLARE
  table_count INTEGER;
  bucket_count INTEGER;
  policy_count INTEGER;
  notification_count INTEGER;
BEGIN
  -- Count created components
  SELECT COUNT(*) INTO table_count FROM information_schema.tables 
  WHERE table_name IN ('platform_feedback', 'feedback_activity') AND table_schema = 'public';
  
  SELECT COUNT(*) INTO bucket_count FROM storage.buckets WHERE id = 'feedback-screenshots';
  
  SELECT COUNT(*) INTO policy_count FROM pg_policies 
  WHERE tablename IN ('platform_feedback', 'feedback_activity') AND schemaname = 'public';
  
  SELECT COUNT(*) INTO notification_count FROM notification_triggers WHERE event_type = 'new_feedback';
  
  RAISE NOTICE '';
  RAISE NOTICE '===== FEEDBACK SYSTEM SETUP COMPLETE =====';
  RAISE NOTICE '✓ Tables created: % of 2', table_count;
  RAISE NOTICE '✓ Storage bucket: % of 1', bucket_count;
  RAISE NOTICE '✓ RLS policies: %', policy_count;
  RAISE NOTICE '✓ Notification triggers: % of 1', notification_count;
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Run verify-feedback-system.sql to confirm all components';
  RAISE NOTICE '2. Test feedback submission from the frontend';
  RAISE NOTICE '3. Check admin notifications for new feedback';
  RAISE NOTICE '';
END $$;