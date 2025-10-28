-- Comprehensive RLS Policies for RBAC System
-- This migration adds RLS policies for all critical tables to support the new RBAC system

-- =============================================================================
-- COMMUNITIES & COMMUNITY MEMBERS
-- =============================================================================

-- Enable RLS
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view communities they are members of" ON communities;
DROP POLICY IF EXISTS "Users can view their own community memberships" ON community_members;
DROP POLICY IF EXISTS "Allow all authenticated users to view communities" ON communities;
DROP POLICY IF EXISTS "Allow all authenticated users to view community members" ON community_members;

-- Communities: Allow all authenticated users to view all communities
CREATE POLICY "Allow all authenticated users to view communities"
ON communities
FOR SELECT
TO authenticated
USING (true);

-- Community Members: Allow users to view members of communities they belong to
CREATE POLICY "Allow users to view community members"
ON community_members
FOR SELECT
TO authenticated
USING (
  community_id IN (
    SELECT community_id
    FROM community_members
    WHERE user_id = auth.uid()
  )
  OR
  -- Admins can see all
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND role_type::text = 'admin'
    AND is_active = true
  )
);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notifications;

CREATE POLICY "Users can view their own notifications"
ON user_notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON user_notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- =============================================================================
-- PLATFORM FEEDBACK
-- =============================================================================

ALTER TABLE platform_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can submit feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Admins can view all feedback" ON platform_feedback;

CREATE POLICY "Users can submit feedback"
ON platform_feedback
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own feedback"
ON platform_feedback
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all feedback"
ON platform_feedback
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

-- =============================================================================
-- SCHOOLS & GENERATIONS
-- =============================================================================

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all authenticated users to view schools" ON schools;
DROP POLICY IF EXISTS "Allow all authenticated users to view generations" ON generations;

-- Allow all authenticated users to view schools and generations
CREATE POLICY "Allow all authenticated users to view schools"
ON schools
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow all authenticated users to view generations"
ON generations
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- NETWORKS
-- =============================================================================

ALTER TABLE networks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all authenticated users to view networks" ON networks;

CREATE POLICY "Allow all authenticated users to view networks"
ON networks
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- USER_ROLES (Critical for RBAC)
-- =============================================================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;

-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can view all roles
CREATE POLICY "Admins can view all roles"
ON user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type::text = 'admin'
    AND ur.is_active = true
  )
);

-- =============================================================================
-- SUMMARY
-- =============================================================================

-- Tables with RLS enabled:
-- ✅ communities
-- ✅ community_members
-- ✅ user_notifications
-- ✅ platform_feedback
-- ✅ schools
-- ✅ generations
-- ✅ networks
-- ✅ user_roles
-- ✅ role_permissions (from previous migration)
-- ✅ permission_audit_log (from previous migration)

COMMENT ON TABLE communities IS 'RLS enabled: All authenticated users can view';
COMMENT ON TABLE community_members IS 'RLS enabled: Users can view members of their communities';
COMMENT ON TABLE user_notifications IS 'RLS enabled: Users can view/update own notifications';
COMMENT ON TABLE platform_feedback IS 'RLS enabled: Users can submit and view own, admins see all';
COMMENT ON TABLE schools IS 'RLS enabled: All authenticated users can view';
COMMENT ON TABLE generations IS 'RLS enabled: All authenticated users can view';
COMMENT ON TABLE networks IS 'RLS enabled: All authenticated users can view';
COMMENT ON TABLE user_roles IS 'RLS enabled: Users see own, admins see all';
