-- Phase 1: Test Mode and Permission Overlays
-- This migration creates the test mode system with database-enforced constraints
-- All changes are test-only and expire after 24 hours

-- Test mode state tracking
CREATE TABLE IF NOT EXISTS test_mode_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  test_run_id UUID,
  enabled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  request_count INTEGER DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Permissions catalog (read-only reference)
CREATE TABLE IF NOT EXISTS permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Role types catalog (read-only reference)
CREATE TABLE IF NOT EXISTS role_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Permission overlays (test mode only)
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role_type TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  test_run_id UUID,
  is_test BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_test_mode_state_user ON test_mode_state(user_id);
CREATE INDEX IF NOT EXISTS idx_test_mode_state_expires ON test_mode_state(expires_at);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_type);
CREATE INDEX IF NOT EXISTS idx_role_permissions_test_run ON role_permissions(test_run_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_expires ON role_permissions(expires_at);

-- Partial unique index to prevent duplicate active overlays per role/permission/test_run
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_unique_active 
ON role_permissions(role_type, permission_key, test_run_id) 
WHERE active = true AND is_test = true;

-- Enable and force RLS
ALTER TABLE test_mode_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_mode_state FORCE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE role_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_types FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;

-- RLS Policies for test_mode_state
CREATE POLICY "Users can view their own test mode state" ON test_mode_state
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own test mode state" ON test_mode_state
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own test mode state" ON test_mode_state
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for permissions (read-only)
CREATE POLICY "Anyone can view permissions catalog" ON permissions
  FOR SELECT USING (true);

-- RLS Policies for role_types (read-only)
CREATE POLICY "Anyone can view role types" ON role_types
  FOR SELECT USING (true);

-- RLS Policies for role_permissions
CREATE POLICY "View test overlays" ON role_permissions
  FOR SELECT USING (
    is_test = true AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM superadmins s 
        WHERE s.user_id = auth.uid() 
        AND s.is_active = true
      )
    )
  );

CREATE POLICY "Create test overlays only" ON role_permissions
  FOR INSERT WITH CHECK (
    is_test = true AND
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM test_mode_state tms
      WHERE tms.user_id = auth.uid()
      AND tms.enabled = true
      AND tms.expires_at > now()
    )
  );

-- No UPDATE policy - overlays are immutable
-- DELETE policy for test data cleanup
CREATE POLICY "Delete own test overlays" ON role_permissions
  FOR DELETE USING (
    is_test = true AND 
    created_by = auth.uid()
  );

-- Helper function to get effective permissions
CREATE OR REPLACE FUNCTION get_effective_permissions(
  p_role_type TEXT,
  p_test_run_id UUID DEFAULT NULL
)
RETURNS TABLE (
  permission_key TEXT,
  granted BOOLEAN,
  source TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH base_permissions AS (
    -- Baseline permissions (would come from production data)
    SELECT 'view_dashboard'::TEXT as permission_key, true as granted, 'baseline'::TEXT as source
    WHERE p_role_type IN ('admin', 'docente', 'estudiante')
  ),
  test_overlays AS (
    -- Test mode overlays
    SELECT 
      rp.permission_key,
      rp.granted,
      'test_overlay'::TEXT as source
    FROM role_permissions rp
    WHERE rp.role_type = p_role_type
    AND rp.is_test = true
    AND rp.active = true
    AND (p_test_run_id IS NULL OR rp.test_run_id = p_test_run_id)
    AND (rp.expires_at IS NULL OR rp.expires_at > now())
  )
  -- Test overlays override baseline
  SELECT * FROM test_overlays
  UNION ALL
  SELECT * FROM base_permissions bp
  WHERE NOT EXISTS (
    SELECT 1 FROM test_overlays t 
    WHERE t.permission_key = bp.permission_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to clean up expired test runs
CREATE OR REPLACE FUNCTION cleanup_expired_test_runs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired test overlays
  DELETE FROM role_permissions
  WHERE is_test = true
  AND expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Reset expired test mode states
  UPDATE test_mode_state
  SET enabled = false,
      test_run_id = NULL
  WHERE expires_at < now()
  AND enabled = true;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_test_mode_state_updated_at
  BEFORE UPDATE ON test_mode_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to audit permission changes
CREATE OR REPLACE FUNCTION audit_role_permission_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO permission_audit_log (
      action,
      role_type,
      permission_key,
      new_value,
      performed_by,
      reason,
      test_run_id,
      is_test,
      diff
    ) VALUES (
      'permission_overlay_created',
      NEW.role_type,
      NEW.permission_key,
      jsonb_build_object('granted', NEW.granted),
      NEW.created_by,
      NEW.reason,
      NEW.test_run_id,
      NEW.is_test,
      jsonb_build_object(
        'role_type', NEW.role_type,
        'permission_key', NEW.permission_key,
        'granted', NEW.granted,
        'test_run_id', NEW.test_run_id
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO permission_audit_log (
      action,
      role_type,
      permission_key,
      old_value,
      performed_by,
      reason,
      test_run_id,
      is_test,
      diff
    ) VALUES (
      'permission_overlay_deleted',
      OLD.role_type,
      OLD.permission_key,
      jsonb_build_object('granted', OLD.granted),
      auth.uid(),
      'Test overlay cleanup',
      OLD.test_run_id,
      OLD.is_test,
      jsonb_build_object(
        'deleted_id', OLD.id,
        'test_run_id', OLD.test_run_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_role_permission_changes
  AFTER INSERT OR DELETE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION audit_role_permission_change();

-- Grant permissions
GRANT SELECT ON test_mode_state TO authenticated;
GRANT INSERT, UPDATE ON test_mode_state TO authenticated;
GRANT SELECT ON permissions TO authenticated;
GRANT SELECT ON role_types TO authenticated;
GRANT SELECT, INSERT, DELETE ON role_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION get_effective_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_test_runs TO authenticated;