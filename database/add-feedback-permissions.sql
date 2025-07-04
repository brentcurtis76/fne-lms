-- =============================================
-- ADD FEEDBACK PERMISSIONS SYSTEM
-- =============================================
-- This migration adds a permission system to control
-- who can submit feedback (bugs/enhancements)
-- Only admins and explicitly granted users can submit
-- =============================================

BEGIN;

-- Create feedback_permissions table
CREATE TABLE IF NOT EXISTS feedback_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES profiles(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedback_permissions_user_id ON feedback_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_permissions_is_active ON feedback_permissions(is_active);

-- Enable RLS
ALTER TABLE feedback_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can view all permissions
CREATE POLICY "Admins can view all feedback permissions" 
  ON feedback_permissions 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Admins can create permissions
CREATE POLICY "Admins can grant feedback permissions" 
  ON feedback_permissions 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Admins can update permissions (revoke)
CREATE POLICY "Admins can update feedback permissions" 
  ON feedback_permissions 
  FOR UPDATE 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Users can see their own permissions
CREATE POLICY "Users can view own feedback permissions" 
  ON feedback_permissions 
  FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

-- Create a function to check if user has feedback permission
CREATE OR REPLACE FUNCTION has_feedback_permission(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admins always have permission
  IF EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = check_user_id 
    AND role = 'admin'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has been granted permission
  RETURN EXISTS (
    SELECT 1 FROM feedback_permissions 
    WHERE user_id = check_user_id 
    AND is_active = TRUE 
    AND revoked_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION has_feedback_permission TO authenticated;

-- Add comment
COMMENT ON TABLE feedback_permissions IS 'Tracks which non-admin users have permission to submit feedback';
COMMENT ON FUNCTION has_feedback_permission IS 'Checks if a user has permission to submit feedback (admins always have permission)';

COMMIT;