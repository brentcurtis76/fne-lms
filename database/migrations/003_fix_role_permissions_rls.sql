-- Fix RLS policies for role_permissions table to allow clients to read permissions
-- This is required for the PermissionContext to work on the client side

-- Enable RLS on role_permissions if not already enabled
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Allow users to read their own role permissions" ON role_permissions;

-- Create policy to allow authenticated users to read permissions for their own roles
CREATE POLICY "Allow users to read their own role permissions"
ON role_permissions
FOR SELECT
TO authenticated
USING (
  role_type::text IN (
    SELECT role_type::text
    FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
  )
);

-- Also need to allow reading permission_audit_log for admins
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admins to read audit logs" ON permission_audit_log;

CREATE POLICY "Allow admins to read audit logs"
ON permission_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND role_type::text = 'admin'
    AND is_active = true
  )
);
