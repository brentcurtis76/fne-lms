-- FNE LMS 6-Role System Migration
-- This migration creates the new role system while maintaining backward compatibility

-- 1. Create organizational structure tables
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  region TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'Tractor' or 'Innova'
  grade_range TEXT, -- e.g., 'PreK-2nd' or '3rd-12th'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_teachers INTEGER DEFAULT 16,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create new role types enum
CREATE TYPE user_role_type AS ENUM (
  'global_admin',        -- FNE staff with full platform control
  'consultant',          -- FNE consultants assigned to specific schools
  'leadership_team',     -- School-level administrators
  'generation_leader',   -- Leaders of Tractor/Innova generations
  'community_leader',    -- Leaders of Growth Communities (2-16 teachers)
  'teacher'             -- Regular teachers/course participants
);

-- 3. Create user_roles table for multi-role assignment
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_type user_role_type NOT NULL,
  
  -- Organizational scope (nullable for global roles)
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES growth_communities(id) ON DELETE CASCADE,
  
  -- Permissions and scope
  is_active BOOLEAN DEFAULT TRUE,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Future reporting scopes
  reporting_scope JSONB DEFAULT '{}', -- For future analytics features
  feedback_scope JSONB DEFAULT '{}',  -- For future feedback workflows
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique role per organizational scope
  UNIQUE(user_id, role_type, school_id, generation_id, community_id)
);

-- 4. Add organizational references to profiles (backward compatibility)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES generations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES growth_communities(id);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_type ON user_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_user_roles_school_id ON user_roles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);

-- 6. Create helper function to check if user has global admin privileges
CREATE OR REPLACE FUNCTION is_global_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = user_uuid 
    AND role_type = 'global_admin' 
    AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to get user's highest role level (for backward compatibility)
CREATE OR REPLACE FUNCTION get_user_admin_status(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user has global_admin role or legacy admin role
  RETURN (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = user_uuid 
      AND role_type = 'global_admin' 
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

-- 8. Create view for easy role querying
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

-- 9. Insert default organizational structure for existing users
INSERT INTO schools (name, code) VALUES 
  ('Escuela Demo FNE', 'DEMO001') 
ON CONFLICT DO NOTHING;

-- Get the demo school ID for use in generations
DO $$
DECLARE
  demo_school_id UUID;
BEGIN
  SELECT id INTO demo_school_id FROM schools WHERE code = 'DEMO001' LIMIT 1;
  
  IF demo_school_id IS NOT NULL THEN
    -- Insert default generations
    INSERT INTO generations (school_id, name, grade_range, description) VALUES 
      (demo_school_id, 'Tractor', 'PreK-2nd', 'Generación Tractor (Pre-Kinder a 2do básico)'),
      (demo_school_id, 'Innova', '3rd-12th', 'Generación Innova (3ero básico a 4to medio)')
    ON CONFLICT DO NOTHING;
    
    -- Insert default growth communities
    INSERT INTO growth_communities (school_id, generation_id, name, description) 
    SELECT 
      demo_school_id,
      g.id,
      g.name || ' - Comunidad 1',
      'Comunidad de Crecimiento ' || g.name || ' por defecto'
    FROM generations g 
    WHERE g.school_id = demo_school_id
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 10. Create RLS policies for new tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Schools policies
CREATE POLICY "Global admins can manage all schools" ON schools
  FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users can view their own school" ON schools
  FOR SELECT USING (
    id IN (
      SELECT school_id FROM user_roles 
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Generations policies  
CREATE POLICY "Global admins can manage all generations" ON generations
  FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users can view generations in their school" ON generations
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_roles 
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Growth communities policies
CREATE POLICY "Global admins can manage all communities" ON growth_communities
  FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users can view communities in their scope" ON growth_communities
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM user_roles 
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- User roles policies
CREATE POLICY "Global admins can manage all user roles" ON user_roles
  FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- 11. Migration script to preserve existing users
-- Convert existing admin users to global_admin
INSERT INTO user_roles (user_id, role_type, is_active, assigned_at)
SELECT 
  id as user_id,
  'global_admin' as role_type,
  TRUE as is_active,
  NOW() as assigned_at
FROM profiles 
WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- Convert existing docente users to teacher role with demo school assignment
INSERT INTO user_roles (user_id, role_type, school_id, is_active, assigned_at)
SELECT 
  p.id as user_id,
  'teacher' as role_type,
  s.id as school_id,
  TRUE as is_active,
  NOW() as assigned_at
FROM profiles p
CROSS JOIN schools s 
WHERE p.role = 'docente' 
AND s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

-- Update profiles to reference demo school for existing users
UPDATE profiles 
SET school_id = (SELECT id FROM schools WHERE code = 'DEMO001' LIMIT 1)
WHERE school_id IS NULL AND role IN ('admin', 'docente');

COMMENT ON TABLE user_roles IS 'Multi-role system allowing users to have different roles across organizational scopes';
COMMENT ON COLUMN user_roles.reporting_scope IS 'JSON configuration for future reporting features';
COMMENT ON COLUMN user_roles.feedback_scope IS 'JSON configuration for future feedback workflows';