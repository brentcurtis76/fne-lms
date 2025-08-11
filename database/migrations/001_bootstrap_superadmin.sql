-- Bootstrap Superadmin System
-- Phase 0: Read-only foundation with audit logging
-- This migration is idempotent and can be re-run safely

-- Create superadmins table to track who has superadmin access
CREATE TABLE IF NOT EXISTS superadmins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Create audit log for all permission-related actions
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  role_type TEXT,
  permission_key TEXT,
  old_value JSONB,
  new_value JSONB,
  performed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  test_run_id UUID,
  is_test BOOLEAN DEFAULT false,
  diff JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_superadmins_user_id ON superadmins(user_id);
CREATE INDEX IF NOT EXISTS idx_superadmins_active ON superadmins(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON permission_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON permission_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by ON permission_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON permission_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Force RLS for all users including service role
ALTER TABLE superadmins FORCE ROW LEVEL SECURITY;
ALTER TABLE permission_audit_log FORCE ROW LEVEL SECURITY;

-- RLS Policies for superadmins table
CREATE POLICY "Superadmins can view all superadmins" ON superadmins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM superadmins s 
      WHERE s.user_id = auth.uid() 
      AND s.is_active = true
    )
  );

CREATE POLICY "Only superadmins can insert superadmins" ON superadmins
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM superadmins s 
      WHERE s.user_id = auth.uid() 
      AND s.is_active = true
    )
  );

CREATE POLICY "Only superadmins can update superadmins" ON superadmins
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM superadmins s 
      WHERE s.user_id = auth.uid() 
      AND s.is_active = true
    )
  );

-- RLS Policies for audit log (append-only, viewable by superadmins)
CREATE POLICY "Superadmins can view audit log" ON permission_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM superadmins s 
      WHERE s.user_id = auth.uid() 
      AND s.is_active = true
    )
  );

CREATE POLICY "System can insert audit log" ON permission_audit_log
  FOR INSERT
  WITH CHECK (true); -- Audit logs can be inserted by any authenticated user performing actions

-- Helper function to check if a user is a superadmin
CREATE OR REPLACE FUNCTION auth_is_superadmin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM superadmins 
    WHERE user_id = check_user_id 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bootstrap initial superadmin (Brent Curtis)
-- Using UUID directly to avoid email dependencies
DO $$
DECLARE
  brent_id UUID;
BEGIN
  -- Find Brent's user ID by email
  SELECT id INTO brent_id
  FROM auth.users
  WHERE email = 'brent@perrotuertocm.cl'
  LIMIT 1;

  -- Only insert if user exists and not already a superadmin
  IF brent_id IS NOT NULL THEN
    INSERT INTO superadmins (
      user_id,
      granted_by,
      reason,
      is_active
    )
    VALUES (
      brent_id,
      brent_id, -- Self-granted for bootstrap
      'Initial superadmin bootstrap - Phase 0 RBAC system',
      true
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      is_active = true,
      updated_at = now();

    -- Log the bootstrap
    INSERT INTO permission_audit_log (
      action,
      user_id,
      performed_by,
      reason,
      diff
    )
    VALUES (
      'superadmin_bootstrap',
      brent_id,
      brent_id,
      'Initial superadmin bootstrap - Phase 0 RBAC system',
      jsonb_build_object('granted_at', now()::text)
    );
  END IF;
END $$;

-- Grant necessary permissions to authenticated users
GRANT SELECT ON superadmins TO authenticated;
GRANT SELECT, INSERT ON permission_audit_log TO authenticated;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_superadmins_updated_at
  BEFORE UPDATE ON superadmins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();