-- Migration: 004_create_secure_workspace_rpcs.sql
-- Purpose: Create secure RPC functions that get user identity from auth.uid()
-- Critical: Replaces client-provided userId with server-side auth context

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

-- Create secure function for ending dev impersonation
CREATE OR REPLACE FUNCTION end_dev_impersonation_secure(p_user_agent text DEFAULT NULL)
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

    -- End any active impersonation sessions for this user
    UPDATE dev_role_sessions
    SET is_active = false,
        ended_at = now()
    WHERE dev_user_id = v_user_id
      AND is_active = true;

    -- Log the action
    INSERT INTO dev_audit_log (
        dev_user_id,
        action,
        details,
        user_agent,
        created_at
    ) VALUES (
        v_user_id,
        'end_impersonation',
        jsonb_build_object(
            'method', 'manual_end',
            'timestamp', now()
        ),
        p_user_agent,
        now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION end_dev_impersonation_secure(text) TO authenticated;
COMMENT ON FUNCTION end_dev_impersonation_secure IS 'Securely end dev impersonation for the authenticated user. User ID is obtained from auth.uid() to prevent spoofing.';

-- Create secure function for assigning roles
CREATE OR REPLACE FUNCTION assign_role_secure(
    p_target_user_id uuid,
    p_role_type text,
    p_school_id uuid DEFAULT NULL,
    p_generation_id uuid DEFAULT NULL,
    p_community_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assigner_id uuid;
    v_is_admin boolean;
    v_final_community_id uuid;
    v_result jsonb;
BEGIN
    -- Get assigner ID from auth context
    v_assigner_id := auth.uid();
    
    -- Check if user is authenticated
    IF v_assigner_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Verify assigner has admin privileges
    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_assigner_id
          AND role_type = 'admin'
          AND is_active = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden asignar roles');
    END IF;

    -- Auto-create community for lider_comunidad role if needed
    IF p_role_type = 'lider_comunidad' AND p_school_id IS NOT NULL AND p_community_id IS NULL THEN
        -- Call the existing function to get or create community
        SELECT get_or_create_community_for_leader(p_target_user_id, p_school_id::text, p_generation_id)
        INTO v_final_community_id;
    ELSE
        v_final_community_id := p_community_id;
    END IF;

    -- Insert the role assignment
    INSERT INTO user_roles (
        user_id,
        role_type,
        school_id,
        generation_id,
        community_id,
        is_active,
        assigned_by,
        assigned_at
    ) VALUES (
        p_target_user_id,
        p_role_type,
        p_school_id,
        p_generation_id,
        v_final_community_id,
        true,
        v_assigner_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'communityId', v_final_community_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Error al asignar rol: ' || SQLERRM
        );
END;
$$;

-- Create secure function for removing roles
CREATE OR REPLACE FUNCTION remove_role_secure(p_role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_remover_id uuid;
    v_is_admin boolean;
BEGIN
    -- Get remover ID from auth context
    v_remover_id := auth.uid();
    
    -- Check if user is authenticated
    IF v_remover_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Verify remover has admin privileges
    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_remover_id
          AND role_type = 'admin'
          AND is_active = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden remover roles');
    END IF;

    -- Deactivate the role
    UPDATE user_roles
    SET is_active = false
    WHERE id = p_role_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Error al remover rol: ' || SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_role_secure(uuid, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_role_secure(uuid) TO authenticated;

COMMENT ON FUNCTION assign_role_secure IS 'Securely assign a role to a user. Only admins can assign roles. Assigner ID is obtained from auth.uid().';
COMMENT ON FUNCTION remove_role_secure IS 'Securely remove a role from a user. Only admins can remove roles. Remover ID is obtained from auth.uid().';