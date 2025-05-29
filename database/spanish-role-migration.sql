-- Spanish Role System Migration for FNE LMS
-- Consistent Spanish naming that aligns with existing 'docente' convention
-- Run this in Supabase SQL Editor

-- 1. Create role types enum with Spanish names
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
        CREATE TYPE user_role_type AS ENUM (
            'admin',              -- FNE staff with full platform control (replaces old admin)
            'consultor',          -- FNE consultants assigned to specific schools  
            'equipo_directivo',   -- School-level administrators
            'lider_generacion',   -- Leaders of Tractor/Innova generations
            'lider_comunidad',    -- Leaders of Growth Communities (2-16 teachers)
            'docente'             -- Regular teachers/course participants (keeps existing docente)
        );
    END IF;
END $$;

-- 2. Create organizational structure tables
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade_range TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    max_teachers INTEGER DEFAULT 16,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_type user_role_type NOT NULL,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
    community_id UUID REFERENCES growth_communities(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES profiles(id),
    reporting_scope JSONB DEFAULT '{}',
    feedback_scope JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, role_type, school_id, generation_id, community_id)
);

-- 4. Add organizational columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES generations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES growth_communities(id);

-- 5. Create helper functions with Spanish role names
CREATE OR REPLACE FUNCTION is_global_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = user_uuid 
        AND role_type = 'admin' 
        AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function for backward compatibility
CREATE OR REPLACE FUNCTION get_user_admin_status(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = user_uuid 
            AND role_type = 'admin' 
            AND is_active = TRUE
        ) OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = user_uuid 
            AND role = 'admin'
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Insert default data
INSERT INTO schools (name, code) VALUES 
    ('Escuela Demo FNE', 'DEMO001') 
ON CONFLICT (code) DO NOTHING;

-- 8. Insert default generations
INSERT INTO generations (school_id, name, grade_range)
SELECT 
    s.id,
    'Tractor',
    'PreK-2nd'
FROM schools s 
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

INSERT INTO generations (school_id, name, grade_range)
SELECT 
    s.id,
    'Innova', 
    '3rd-12th'
FROM schools s 
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

-- 9. Insert default growth communities
INSERT INTO growth_communities (school_id, generation_id, name)
SELECT 
    s.id,
    g.id,
    g.name || ' - Comunidad 1'
FROM schools s
JOIN generations g ON g.school_id = s.id
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

-- 10. Migrate existing users (Spanish role names)
-- Convert admin users to admin role (global admin powers)
INSERT INTO user_roles (user_id, role_type, is_active)
SELECT 
    id,
    'admin',
    TRUE
FROM profiles 
WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- Convert docente users to docente role (keeps existing naming)
INSERT INTO user_roles (user_id, role_type, school_id, is_active)
SELECT 
    p.id,
    'docente',
    s.id,
    TRUE
FROM profiles p
CROSS JOIN schools s 
WHERE p.role = 'docente' 
AND s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

-- Update profiles with school reference
UPDATE profiles 
SET school_id = (SELECT id FROM schools WHERE code = 'DEMO001' LIMIT 1)
WHERE school_id IS NULL;

-- 11. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_type ON user_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_school ON user_roles(school_id);

-- 12. Enable RLS on new tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 13. Create RLS policies
CREATE POLICY "Admins manage schools" ON schools
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view their school" ON schools
    FOR SELECT USING (
        id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Admins manage generations" ON generations
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view generations in their school" ON generations
    FOR SELECT USING (
        school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Admins manage communities" ON growth_communities
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view communities in their scope" ON growth_communities
    FOR SELECT USING (
        school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Admins manage user roles" ON user_roles
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view own roles" ON user_roles
    FOR SELECT USING (user_id = auth.uid());

-- 14. Create view for easy role querying
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
    ur.created_at as role_assigned_at
FROM user_roles ur
LEFT JOIN schools s ON ur.school_id = s.id
LEFT JOIN generations g ON ur.generation_id = g.id
LEFT JOIN growth_communities gc ON ur.community_id = gc.id
LEFT JOIN profiles p ON ur.user_id = p.id
WHERE ur.is_active = TRUE;

COMMENT ON TABLE user_roles IS 'Sistema de roles en español: admin (global), consultor, equipo_directivo, lider_generacion, lider_comunidad, docente';
COMMENT ON COLUMN user_roles.role_type IS 'Tipo de rol en español que corresponde con convención existente de docente';
COMMENT ON COLUMN user_roles.reporting_scope IS 'Configuración JSON para funciones futuras de reportes';
COMMENT ON COLUMN user_roles.feedback_scope IS 'Configuración JSON para flujos futuros de retroalimentación';