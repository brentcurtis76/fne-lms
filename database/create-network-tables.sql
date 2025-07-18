-- Create all network tables and policies
-- Run this AFTER adding the supervisor_de_red enum

BEGIN;

-- Create networks table
CREATE TABLE IF NOT EXISTS redes_de_colegios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create school-network assignment table
CREATE TABLE IF NOT EXISTS red_escuelas (
    red_id UUID REFERENCES redes_de_colegios(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (red_id, school_id)
);

-- Add red_id column to user_roles if it doesn't exist
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS red_id UUID REFERENCES redes_de_colegios(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_red_id ON user_roles(red_id) WHERE red_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_red_escuelas_school_id ON red_escuelas(school_id);
CREATE INDEX IF NOT EXISTS idx_red_escuelas_red_id ON red_escuelas(red_id);

-- Enable RLS
ALTER TABLE redes_de_colegios ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_escuelas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for admins
CREATE POLICY "networks_admin_all_access" ON redes_de_colegios
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'admin' 
            AND ur.is_active = true
        )
    );

CREATE POLICY "red_escuelas_admin_all_access" ON red_escuelas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'admin' 
            AND ur.is_active = true
        )
    );

-- Create RLS policies for supervisors
CREATE POLICY "networks_supervisor_read" ON redes_de_colegios
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'supervisor_de_red'
            AND ur.red_id = id
            AND ur.is_active = true
        )
    );

CREATE POLICY "red_escuelas_supervisor_read" ON red_escuelas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'supervisor_de_red'
            AND ur.red_id = red_escuelas.red_id
            AND ur.is_active = true
        )
    );

COMMIT;

-- Verify everything was created
SELECT 
    'redes_de_colegios exists' as check,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'redes_de_colegios') as result
UNION ALL
SELECT 
    'red_escuelas exists' as check,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'red_escuelas') as result
UNION ALL
SELECT 
    'red_id column exists' as check,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'red_id') as result;