-- Allow All Roles to Belong to Growth Communities
-- This update modifies the role assignment logic to allow any role type to be assigned to a growth community
-- Run this in Supabase SQL Editor

-- 1. Update the user_roles table to ensure community_id can be set for any role
-- (The schema already supports this, no changes needed to table structure)

-- 2. Update comments to reflect new logic
COMMENT ON TABLE user_roles IS 'Sistema de roles en español: todos los roles pueden pertenecer a comunidades de crecimiento';
COMMENT ON COLUMN user_roles.community_id IS 'ID de comunidad de crecimiento - todos los roles pueden pertenecer a una comunidad';

-- 3. Update the view to better show community assignments for all roles
CREATE OR REPLACE VIEW user_roles_view AS
SELECT 
    ur.user_id,
    ur.role_type,
    ur.is_active,
    s.name as school_name,
    g.name as generation_name,
    gc.name as community_name,
    p.first_name,
    p.last_name,
    p.email,
    ur.created_at as role_assigned_at,
    -- Add community context for all roles
    CASE 
        WHEN ur.community_id IS NOT NULL THEN 'Miembro de Comunidad'
        WHEN ur.role_type = 'lider_comunidad' THEN 'Líder de Comunidad'
        ELSE 'Sin Comunidad Asignada'
    END as community_status
FROM user_roles ur
LEFT JOIN schools s ON ur.school_id = s.id
LEFT JOIN generations g ON ur.generation_id = g.id
LEFT JOIN growth_communities gc ON ur.community_id = gc.id
LEFT JOIN profiles p ON ur.user_id = p.id
WHERE ur.is_active = TRUE;

-- 4. Add helper function to check if user belongs to any community
CREATE OR REPLACE FUNCTION user_belongs_to_community(user_uuid UUID, community_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = user_uuid 
        AND community_id = community_uuid 
        AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add function to get all users in a community (regardless of role)
CREATE OR REPLACE FUNCTION get_community_members(community_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    role_type user_role_type,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.user_id,
        ur.role_type,
        p.first_name,
        p.last_name,
        p.email,
        p.avatar_url
    FROM user_roles ur
    JOIN profiles p ON ur.user_id = p.id
    WHERE ur.community_id = community_uuid 
    AND ur.is_active = TRUE
    ORDER BY ur.role_type, p.first_name, p.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update RLS policies to support community access for all roles
-- Allow users to view communities they belong to
DROP POLICY IF EXISTS "Users view communities in their scope" ON growth_communities;
CREATE POLICY "Users view communities in their scope" ON growth_communities
    FOR SELECT USING (
        -- Admins can see all
        is_global_admin(auth.uid()) OR
        -- Users can see communities in their school
        school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE) OR
        -- Users can see communities they belong to
        id IN (SELECT community_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

-- 7. Add index for better performance on community lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_community_active ON user_roles(community_id, is_active) WHERE community_id IS NOT NULL;

-- 8. Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully updated role system to allow all roles to belong to growth communities';
    RAISE NOTICE 'All six role types (admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, docente) can now be assigned to growth communities';
END $$;