-- Add Developer Role with Role-Switching Capability
-- This migration adds a 'dev' role that can impersonate other roles for testing

-- 1. Update the user_role_type enum to include 'dev'
-- Note: PostgreSQL doesn't allow direct enum modification, so we need to recreate it
DO $$ 
BEGIN
    -- Create a new enum type with all values including 'dev'
    CREATE TYPE user_role_type_new AS ENUM (
        'admin',              -- FNE staff with full platform control
        'consultor',          -- FNE consultants assigned to specific schools  
        'equipo_directivo',   -- School-level administrators
        'lider_generacion',   -- Leaders of Tractor/Innova generations
        'lider_comunidad',    -- Leaders of Growth Communities (2-16 teachers)
        'docente',            -- Regular teachers/course participants
        'dev'                 -- Developers with role-switching capability
    );

    -- Update the column to use the new enum
    ALTER TABLE user_roles 
        ALTER COLUMN role_type TYPE user_role_type_new 
        USING role_type::text::user_role_type_new;

    -- Drop the old enum
    DROP TYPE user_role_type;

    -- Rename the new enum to the original name
    ALTER TYPE user_role_type_new RENAME TO user_role_type;
END $$;

-- 2. Create table to track dev role impersonation sessions
CREATE TABLE IF NOT EXISTS dev_role_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dev_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    impersonated_role user_role_type NOT NULL,
    -- Optional: impersonate a specific user's context
    impersonated_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- Organizational context for the impersonation
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
    community_id UUID REFERENCES growth_communities(id) ON DELETE SET NULL,
    -- Session tracking
    session_token TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '8 hours',
    ended_at TIMESTAMP WITH TIME ZONE,
    -- Audit info
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX idx_dev_sessions_dev_user ON dev_role_sessions(dev_user_id);
CREATE INDEX idx_dev_sessions_token ON dev_role_sessions(session_token);
CREATE INDEX idx_dev_sessions_active ON dev_role_sessions(is_active);
CREATE INDEX idx_dev_sessions_expires ON dev_role_sessions(expires_at);

-- 4. Create audit log for dev actions
CREATE TABLE IF NOT EXISTS dev_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dev_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dev_audit_user ON dev_audit_log(dev_user_id);
CREATE INDEX idx_dev_audit_created ON dev_audit_log(created_at);

-- 5. Create function to check if user is a dev
CREATE OR REPLACE FUNCTION is_dev_user(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = user_uuid 
        AND role_type = 'dev' 
        AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function to get active dev impersonation
CREATE OR REPLACE FUNCTION get_active_dev_impersonation(user_uuid UUID)
RETURNS TABLE (
    impersonated_role user_role_type,
    impersonated_user_id UUID,
    school_id UUID,
    generation_id UUID,
    community_id UUID,
    session_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ds.impersonated_role,
        ds.impersonated_user_id,
        ds.school_id,
        ds.generation_id,
        ds.community_id,
        ds.session_token,
        ds.expires_at
    FROM dev_role_sessions ds
    WHERE ds.dev_user_id = user_uuid
    AND ds.is_active = TRUE
    AND ds.expires_at > NOW()
    ORDER BY ds.started_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to get effective role (considering dev impersonation)
CREATE OR REPLACE FUNCTION get_effective_user_role(user_uuid UUID)
RETURNS user_role_type AS $$
DECLARE
    v_impersonated_role user_role_type;
    v_actual_role user_role_type;
BEGIN
    -- Check if user is a dev with active impersonation
    IF is_dev_user(user_uuid) THEN
        SELECT impersonated_role INTO v_impersonated_role
        FROM get_active_dev_impersonation(user_uuid);
        
        IF v_impersonated_role IS NOT NULL THEN
            RETURN v_impersonated_role;
        END IF;
    END IF;
    
    -- Return user's highest actual role
    SELECT role_type INTO v_actual_role
    FROM user_roles
    WHERE user_id = user_uuid
    AND is_active = TRUE
    ORDER BY 
        CASE role_type
            WHEN 'admin' THEN 1
            WHEN 'dev' THEN 2
            WHEN 'consultor' THEN 3
            WHEN 'equipo_directivo' THEN 4
            WHEN 'lider_generacion' THEN 5
            WHEN 'lider_comunidad' THEN 6
            WHEN 'docente' THEN 7
        END
    LIMIT 1;
    
    RETURN v_actual_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create function to start dev impersonation
CREATE OR REPLACE FUNCTION start_dev_impersonation(
    p_dev_user_id UUID,
    p_impersonated_role user_role_type,
    p_impersonated_user_id UUID DEFAULT NULL,
    p_school_id UUID DEFAULT NULL,
    p_generation_id UUID DEFAULT NULL,
    p_community_id UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_session_token TEXT;
BEGIN
    -- Verify user is a dev
    IF NOT is_dev_user(p_dev_user_id) THEN
        RAISE EXCEPTION 'User is not authorized as a developer';
    END IF;
    
    -- End any existing active sessions
    UPDATE dev_role_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE dev_user_id = p_dev_user_id
    AND is_active = TRUE;
    
    -- Generate session token
    v_session_token := encode(gen_random_bytes(32), 'hex');
    
    -- Create new impersonation session
    INSERT INTO dev_role_sessions (
        dev_user_id,
        impersonated_role,
        impersonated_user_id,
        school_id,
        generation_id,
        community_id,
        session_token,
        ip_address,
        user_agent
    ) VALUES (
        p_dev_user_id,
        p_impersonated_role,
        p_impersonated_user_id,
        p_school_id,
        p_generation_id,
        p_community_id,
        v_session_token,
        p_ip_address,
        p_user_agent
    );
    
    -- Log the action
    INSERT INTO dev_audit_log (dev_user_id, action, details, ip_address, user_agent)
    VALUES (
        p_dev_user_id,
        'start_impersonation',
        jsonb_build_object(
            'role', p_impersonated_role,
            'user_id', p_impersonated_user_id,
            'school_id', p_school_id,
            'generation_id', p_generation_id,
            'community_id', p_community_id
        ),
        p_ip_address,
        p_user_agent
    );
    
    RETURN v_session_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to end dev impersonation
CREATE OR REPLACE FUNCTION end_dev_impersonation(
    p_dev_user_id UUID,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update active sessions
    UPDATE dev_role_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE dev_user_id = p_dev_user_id
    AND is_active = TRUE;
    
    -- Log the action
    INSERT INTO dev_audit_log (dev_user_id, action, details, ip_address, user_agent)
    VALUES (
        p_dev_user_id,
        'end_impersonation',
        '{}',
        p_ip_address,
        p_user_agent
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Enable RLS on new tables
ALTER TABLE dev_role_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_audit_log ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies
-- Dev users can manage their own sessions
CREATE POLICY "Devs manage own sessions" ON dev_role_sessions
    FOR ALL USING (dev_user_id = auth.uid() AND is_dev_user(auth.uid()));

-- Admins can view all dev sessions
CREATE POLICY "Admins view all dev sessions" ON dev_role_sessions
    FOR SELECT USING (is_global_admin(auth.uid()));

-- Dev users can view their own audit log
CREATE POLICY "Devs view own audit log" ON dev_audit_log
    FOR SELECT USING (dev_user_id = auth.uid() AND is_dev_user(auth.uid()));

-- Admins can view all audit logs
CREATE POLICY "Admins view all audit logs" ON dev_audit_log
    FOR SELECT USING (is_global_admin(auth.uid()));

-- 12. Create cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_dev_sessions()
RETURNS void AS $$
BEGIN
    UPDATE dev_role_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE is_active = TRUE
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 13. Add comments for documentation
COMMENT ON TABLE dev_role_sessions IS 'Tracks active role impersonation sessions for developers';
COMMENT ON TABLE dev_audit_log IS 'Audit log for all developer actions including role switching';
COMMENT ON COLUMN dev_role_sessions.session_token IS 'Unique token for the impersonation session';
COMMENT ON COLUMN dev_role_sessions.expires_at IS 'Sessions auto-expire after 8 hours for security';
COMMENT ON FUNCTION get_effective_user_role IS 'Returns the effective role considering dev impersonation';

-- 14. Grant necessary permissions
GRANT EXECUTE ON FUNCTION is_dev_user TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_dev_impersonation TO authenticated;
GRANT EXECUTE ON FUNCTION get_effective_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION start_dev_impersonation TO authenticated;
GRANT EXECUTE ON FUNCTION end_dev_impersonation TO authenticated;