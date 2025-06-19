-- Community Workspaces Database Schema (Safe Version)
-- This version can be run multiple times without causing duplicate errors
-- Creates the foundation for collaborative workspace functionality

-- 1. Create community_workspaces table
CREATE TABLE IF NOT EXISTS community_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES growth_communities(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one workspace per community
  UNIQUE(community_id)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_workspaces_community_id ON community_workspaces(community_id);
CREATE INDEX IF NOT EXISTS idx_community_workspaces_active ON community_workspaces(is_active);

-- 3. Create workspace activity log (for future features)
CREATE TABLE IF NOT EXISTS workspace_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'document_upload', 'message_posted', 'meeting_scheduled', etc.
  activity_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create index for activity queries
CREATE INDEX IF NOT EXISTS idx_workspace_activities_workspace_id ON workspace_activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activities_created_at ON workspace_activities(created_at);

-- 5. Row Level Security Policies (with safe drop/create)

-- Enable RLS on tables (safe to run multiple times)
ALTER TABLE community_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_activities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before creating new ones
DROP POLICY IF EXISTS "Community members can view their workspace" ON community_workspaces;
DROP POLICY IF EXISTS "Community leaders and admins can update workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Admins can create workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Community members can view workspace activities" ON workspace_activities;
DROP POLICY IF EXISTS "Community members can insert workspace activities" ON workspace_activities;

-- Policy 1: Community members can view their workspace
CREATE POLICY "Community members can view their workspace" ON community_workspaces
  FOR SELECT
  USING (
    -- Allow if user has a role in this community
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.community_id = community_workspaces.community_id
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is consultant with assignments to this community's school
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN growth_communities gc ON gc.id = community_workspaces.community_id
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
      AND ur.school_id = gc.school_id
      AND ur.is_active = TRUE
    )
  );

-- Policy 2: Community leaders and admins can update workspaces
CREATE POLICY "Community leaders and admins can update workspaces" ON community_workspaces
  FOR UPDATE
  USING (
    -- Allow if user is community leader for this community
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.community_id = community_workspaces.community_id
      AND ur.role_type = 'lider_comunidad'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policy 3: Admins can create workspaces
CREATE POLICY "Admins can create workspaces" ON community_workspaces
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policy 4: Community members can view activities in their workspace
CREATE POLICY "Community members can view workspace activities" ON workspace_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = workspace_activities.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is consultant with access to this workspace's community school
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN growth_communities gc ON gc.id = cw.community_id
      JOIN user_roles ur ON ur.school_id = gc.school_id
      WHERE cw.id = workspace_activities.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
      AND ur.is_active = TRUE
    )
  );

-- Policy 5: Community members can insert activities
CREATE POLICY "Community members can insert workspace activities" ON workspace_activities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = workspace_activities.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- 6. Helper function to get or create workspace for a community
CREATE OR REPLACE FUNCTION get_or_create_community_workspace(
  p_community_id UUID
) RETURNS UUID AS $$
DECLARE
  v_workspace_id UUID;
  v_community_name TEXT;
BEGIN
  -- Try to get existing workspace
  SELECT id INTO v_workspace_id
  FROM community_workspaces
  WHERE community_id = p_community_id;
  
  -- If workspace doesn't exist, create it
  IF v_workspace_id IS NULL THEN
    -- Get community name for workspace naming
    SELECT name INTO v_community_name
    FROM growth_communities
    WHERE id = p_community_id;
    
    -- Create new workspace
    INSERT INTO community_workspaces (
      community_id,
      name,
      description,
      settings
    ) VALUES (
      p_community_id,
      'Espacio de ' || COALESCE(v_community_name, 'Comunidad'),
      'Espacio colaborativo para ' || COALESCE(v_community_name, 'esta comunidad'),
      '{
        "features": {
          "meetings": true,
          "documents": true,
          "messaging": true,
          "feed": true
        },
        "permissions": {
          "all_can_post": true,
          "all_can_upload": true
        }
      }'::jsonb
    )
    RETURNING id INTO v_workspace_id;
  END IF;
  
  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Helper function to check if user can access a workspace
CREATE OR REPLACE FUNCTION can_access_workspace(
  p_user_id UUID,
  p_workspace_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    -- Check if user has role in the community
    SELECT 1 FROM community_workspaces cw
    JOIN user_roles ur ON ur.community_id = cw.community_id
    WHERE cw.id = p_workspace_id
    AND ur.user_id = p_user_id
    AND ur.is_active = TRUE
  ) OR EXISTS (
    -- Check if user is admin
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p_user_id
    AND ur.role_type = 'admin'
    AND ur.is_active = TRUE
  ) OR EXISTS (
    -- Check if user is consultant with access to this community's school
    SELECT 1 FROM community_workspaces cw
    JOIN growth_communities gc ON gc.id = cw.community_id
    JOIN user_roles ur ON ur.school_id = gc.school_id
    WHERE cw.id = p_workspace_id
    AND ur.user_id = p_user_id
    AND ur.role_type = 'consultor'
    AND ur.is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Add comments
COMMENT ON TABLE community_workspaces IS 'Collaborative workspaces for growth communities';
COMMENT ON TABLE workspace_activities IS 'Activity log for workspace events and user interactions';
COMMENT ON FUNCTION get_or_create_community_workspace(UUID) IS 'Gets existing workspace or creates one for a community';
COMMENT ON FUNCTION can_access_workspace(UUID, UUID) IS 'Checks if a user can access a specific workspace';