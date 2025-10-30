-- Migration 023: Secure RLS policies for community_workspaces table
-- Date: 2025-10-29
-- Issue: RLS blocking workspace access but previous fix had security hole (data leak)
--
-- SECURITY FIX: Ensures users can ONLY see workspaces for:
--   1. Their assigned communities (community_member, docente, estudiante, etc.)
--   2. Communities in their assigned schools (consultants)
--   3. All communities (admins)
--
-- This matches the logic in utils/workspaceUtils.ts getUserWorkspaceAccess()

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

ALTER TABLE community_workspaces ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- DROP EXISTING POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "authenticated_users_view_community_workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Allow authenticated users to read community workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Allow users to read workspaces for their communities" ON community_workspaces;
DROP POLICY IF EXISTS "Allow admins and community managers to modify workspaces" ON community_workspaces;

-- =============================================================================
-- READ POLICIES (SELECT)
-- =============================================================================

-- Policy 1: Admins can see ALL workspaces
CREATE POLICY "admins_read_all_workspaces"
ON community_workspaces
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 2: Consultants can see workspaces for communities in their assigned schools
CREATE POLICY "consultants_read_school_workspaces"
ON community_workspaces
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    JOIN growth_communities ON growth_communities.school_id = user_roles.school_id
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'consultor'
    AND growth_communities.id = community_workspaces.community_id
  )
);

-- Policy 3: Community members can see workspaces for their assigned communities
CREATE POLICY "members_read_their_workspaces"
ON community_workspaces
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.community_id = community_workspaces.community_id
  )
);

-- =============================================================================
-- WRITE POLICIES (INSERT, UPDATE, DELETE)
-- =============================================================================

-- Policy 4: Admins can modify all workspaces
CREATE POLICY "admins_modify_all_workspaces"
ON community_workspaces
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 5: Community managers can modify workspaces for their community
CREATE POLICY "community_managers_modify_their_workspace"
ON community_workspaces
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'community_manager'
    AND user_roles.community_id = community_workspaces.community_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'community_manager'
    AND user_roles.community_id = community_workspaces.community_id
  )
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RLS Policies Applied Successfully for community_workspaces';
  RAISE NOTICE '';
  RAISE NOTICE 'READ Policies:';
  RAISE NOTICE '  1. admins_read_all_workspaces - Admins see ALL workspaces';
  RAISE NOTICE '  2. consultants_read_school_workspaces - Consultants see workspaces in their schools';
  RAISE NOTICE '  3. members_read_their_workspaces - Members see their community workspaces';
  RAISE NOTICE '';
  RAISE NOTICE 'WRITE Policies:';
  RAISE NOTICE '  4. admins_modify_all_workspaces - Admins can modify all';
  RAISE NOTICE '  5. community_managers_modify_their_workspace - Managers modify their own';
  RAISE NOTICE '';
  RAISE NOTICE 'Security: ✅ Users can ONLY see workspaces they have legitimate access to';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Have affected users log out and log back in';
  RAISE NOTICE '  2. Run: node scripts/verify-rls-fix.js';
  RAISE NOTICE '  3. Test workspace access with Juan Reyes account';
END $$;
