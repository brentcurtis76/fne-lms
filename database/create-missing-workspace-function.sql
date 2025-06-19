-- Create the missing get_user_workspace_role function
-- This function determines a user's role within a specific workspace

CREATE OR REPLACE FUNCTION get_user_workspace_role(
    p_user_id UUID,
    p_workspace_id UUID
) RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- First check if user is admin (global access)
    SELECT role_type INTO v_role
    FROM user_roles
    WHERE user_id = p_user_id
    AND role_type = 'admin'
    AND is_active = TRUE
    LIMIT 1;
    
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;
    
    -- Check user's role in the workspace's community
    SELECT ur.role_type INTO v_role
    FROM user_roles ur
    JOIN community_workspaces cw ON cw.community_id = ur.community_id
    WHERE ur.user_id = p_user_id
    AND cw.id = p_workspace_id
    AND ur.is_active = TRUE
    LIMIT 1;
    
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;
    
    -- Check if user is consultant with access to this workspace's community school
    SELECT ur.role_type INTO v_role
    FROM user_roles ur
    JOIN community_workspaces cw ON cw.id = p_workspace_id
    JOIN growth_communities gc ON gc.id = cw.community_id
    WHERE ur.user_id = p_user_id
    AND ur.role_type = 'consultor'
    AND ur.school_id = gc.school_id
    AND ur.is_active = TRUE
    LIMIT 1;
    
    RETURN v_role; -- Will be NULL if no access
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION get_user_workspace_role(UUID, UUID) IS 'Returns the user role type for a given workspace, or NULL if no access';

-- Test the function (optional)
-- SELECT get_user_workspace_role(auth.uid(), 'some-workspace-id');