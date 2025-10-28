-- Create role_permissions table for RBAC system
-- This stores the actual permission matrix for each role type
-- Phase 2: Permission Storage

-- Create the role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_type TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role_type, permission_key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_type ON role_permissions(role_type);
CREATE INDEX IF NOT EXISTS idx_role_permissions_enabled ON role_permissions(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_role_permissions_updated_at ON role_permissions(updated_at DESC);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Anyone can read permissions, only superadmins can modify
CREATE POLICY "Anyone can view role permissions" ON role_permissions
  FOR SELECT
  USING (true);

CREATE POLICY "Only superadmins can insert permissions" ON role_permissions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM superadmins s
      WHERE s.user_id = auth.uid()
      AND s.is_active = true
    )
  );

CREATE POLICY "Only superadmins can update permissions" ON role_permissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM superadmins s
      WHERE s.user_id = auth.uid()
      AND s.is_active = true
    )
  );

CREATE POLICY "Only superadmins can delete permissions" ON role_permissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM superadmins s
      WHERE s.user_id = auth.uid()
      AND s.is_active = true
    )
  );

-- Grant necessary permissions
GRANT SELECT ON role_permissions TO authenticated;
GRANT SELECT ON role_permissions TO anon;

-- Create trigger to update updated_at
CREATE TRIGGER update_role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create helper function to check if a role has a permission
CREATE OR REPLACE FUNCTION role_has_permission(
  check_role_type TEXT,
  check_permission_key TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role_type = check_role_type
    AND permission_key = check_permission_key
    AND enabled = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create helper function to get all permissions for a role
CREATE OR REPLACE FUNCTION get_role_permissions(check_role_type TEXT)
RETURNS TABLE (
  permission_key TEXT,
  enabled BOOLEAN,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rp.permission_key,
    rp.enabled,
    rp.description
  FROM role_permissions rp
  WHERE rp.role_type = check_role_type
  ORDER BY rp.permission_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
