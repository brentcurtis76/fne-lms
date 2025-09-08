-- Phase 2: Add baseline permissions table
-- This table stores the baseline (default) permissions for each role
-- It is read-only at runtime; changes only via migrations

-- Create baseline permissions table
CREATE TABLE IF NOT EXISTS role_permission_baseline (
  role_type TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (role_type, permission_key)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_role_permission_baseline_role 
  ON role_permission_baseline(role_type);

-- Add comment for documentation
COMMENT ON TABLE role_permission_baseline IS 'Baseline permissions for roles - read-only, modified only via migrations';
COMMENT ON COLUMN role_permission_baseline.metadata IS 'Optional metadata like category, description, etc.';

-- Enable and force RLS for security
ALTER TABLE role_permission_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission_baseline FORCE ROW LEVEL SECURITY;

-- Read-only policy: all authenticated users can read
CREATE POLICY "Baseline permissions are read-only" 
  ON role_permission_baseline
  FOR SELECT
  USING (true);

-- No INSERT, UPDATE, or DELETE policies - this table is migration-only

-- Grant read access to authenticated users
GRANT SELECT ON role_permission_baseline TO authenticated;

-- Note: This table is populated by migration 005_seed_role_permission_baseline.sql