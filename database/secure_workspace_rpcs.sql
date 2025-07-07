-- Secure RPC Functions for Workspace Utilities
-- These functions get user identity from auth.uid() instead of trusting client input

-- Drop existing insecure function if exists
DROP FUNCTION IF EXISTS can_access_workspace(uuid, uuid);

-- Create secure version that gets user ID from session
CREATE OR REPLACE FUNCTION can_access_workspace_secure(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_has_access boolean;
BEGIN
    -- Get user ID from auth context - cannot be spoofed
    v_user_id := auth.uid();
    
    -- Check if user is null (not authenticated)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user has any role that gives access to this workspace
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN community_workspaces cw ON (
            -- Admin can access all workspaces
            ur.role_type = 'admin'
            -- Consultant can access assigned communities
            OR (ur.role_type = 'consultor' AND (
                cw.community_id = ur.community_id
                OR cw.community_id IN (
                    SELECT community_id FROM user_roles 
                    WHERE user_id = v_user_id AND is_active = true
                )
            ))
            -- Community members can access their community workspace
            OR (ur.community_id = cw.community_id)
        )
        WHERE ur.user_id = v_user_id
        AND ur.is_active = true
        AND cw.id = p_workspace_id
    ) INTO v_has_access;

    RETURN COALESCE(v_has_access, false);
END;
$$;

-- Create secure activity logging function
CREATE OR REPLACE FUNCTION log_workspace_activity_secure(
    p_workspace_id uuid,
    p_activity_type text,
    p_activity_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Get user ID from auth context - cannot be spoofed
    v_user_id := auth.uid();
    
    -- Check if user is authenticated
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;

    -- Verify user has access to the workspace before logging
    IF NOT can_access_workspace_secure(p_workspace_id) THEN
        RAISE EXCEPTION 'User does not have access to this workspace';
    END IF;

    -- Insert the activity with the authenticated user's ID
    INSERT INTO workspace_activities (
        workspace_id,
        user_id,
        activity_type,
        activity_data,
        created_at
    ) VALUES (
        p_workspace_id,
        v_user_id,  -- From auth context, not client input
        p_activity_type,
        p_activity_data,
        now()
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION can_access_workspace_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION log_workspace_activity_secure(uuid, text, jsonb) TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION can_access_workspace_secure IS 'Securely check if the authenticated user can access a workspace. User ID is obtained from auth.uid() to prevent spoofing.';
COMMENT ON FUNCTION log_workspace_activity_secure IS 'Securely log workspace activity for the authenticated user. User ID is obtained from auth.uid() to prevent spoofing.';