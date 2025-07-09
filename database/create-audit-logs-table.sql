-- Create audit_logs table for tracking important system actions
-- This table is optional but recommended for compliance and debugging

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role_type = 'admin'
      AND user_roles.is_active = true
    )
  );

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs" ON audit_logs
  FOR SELECT
  USING (user_id = auth.uid());

-- Only system can insert audit logs (through service role)
-- No INSERT policy needed as service role bypasses RLS

-- Grant permissions
GRANT SELECT ON audit_logs TO authenticated;

-- Comment on table
COMMENT ON TABLE audit_logs IS 'Tracks important system actions for compliance and debugging';