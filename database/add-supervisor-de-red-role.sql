-- ====================================================================
-- FNE LMS: Add "Supervisor de Red" Role System
-- ====================================================================
-- This migration creates the network supervision system with:
-- 1. Network management tables with complete audit trail
-- 2. Role enum update for supervisor_de_red
-- 3. User role association with networks
-- 4. Initial RLS policies for secure access control
--
-- Consultant feedback incorporated:
-- - Composite primary key on red_escuelas for efficiency
-- - Complete audit trail (created_by, assigned_by, last_updated_by)
-- - Enhanced security considerations
-- ====================================================================

BEGIN;

-- ====================================================================
-- 1. CREATE NETWORK MANAGEMENT TABLES
-- ====================================================================

-- Create networks table with audit trail
CREATE TABLE IF NOT EXISTS redes_de_colegios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create school-network assignment table with composite PK
CREATE TABLE IF NOT EXISTS red_escuelas (
    red_id UUID REFERENCES redes_de_colegios(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (red_id, school_id)
);

-- ====================================================================
-- 2. UPDATE USER ROLE ENUM
-- ====================================================================

-- Add supervisor_de_red to the role type enum
DO $$ 
BEGIN
    -- Check if the enum value already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'supervisor_de_red' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_type')
    ) THEN
        ALTER TYPE user_role_type ADD VALUE 'supervisor_de_red';
        RAISE NOTICE 'Added supervisor_de_red to user_role_type enum';
    ELSE
        RAISE NOTICE 'supervisor_de_red already exists in user_role_type enum';
    END IF;
END
$$;

-- ====================================================================
-- 3. UPDATE USER_ROLES TABLE
-- ====================================================================

-- Add network association to user_roles table
DO $$ 
BEGIN
    -- Check if red_id column already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_roles' AND column_name = 'red_id'
    ) THEN
        ALTER TABLE user_roles 
        ADD COLUMN red_id UUID REFERENCES redes_de_colegios(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added red_id column to user_roles table';
    ELSE
        RAISE NOTICE 'red_id column already exists in user_roles table';
    END IF;
END
$$;

-- ====================================================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ====================================================================

-- Index for network lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_red_id ON user_roles(red_id) WHERE red_id IS NOT NULL;

-- Index for school-network queries
CREATE INDEX IF NOT EXISTS idx_red_escuelas_school_id ON red_escuelas(school_id);
CREATE INDEX IF NOT EXISTS idx_red_escuelas_red_id ON red_escuelas(red_id);

-- Index for audit trail queries
CREATE INDEX IF NOT EXISTS idx_redes_created_by ON redes_de_colegios(created_by);
CREATE INDEX IF NOT EXISTS idx_red_escuelas_assigned_by ON red_escuelas(assigned_by);

-- ====================================================================
-- 5. CREATE AUDIT TRIGGER FOR NETWORKS
-- ====================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_redes_de_colegios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_redes_de_colegios_updated_at_trigger ON redes_de_colegios;
CREATE TRIGGER update_redes_de_colegios_updated_at_trigger
    BEFORE UPDATE ON redes_de_colegios
    FOR EACH ROW
    EXECUTE FUNCTION update_redes_de_colegios_updated_at();

-- ====================================================================
-- 6. CREATE UTILITY FUNCTIONS
-- ====================================================================

-- Function to get schools assigned to a network
CREATE OR REPLACE FUNCTION get_network_schools(network_id UUID)
RETURNS TABLE (
    school_id INTEGER,
    school_name VARCHAR,
    school_code VARCHAR,
    assigned_at TIMESTAMPTZ,
    assigned_by_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        s.code,
        re.assigned_at,
        COALESCE(p.first_name || ' ' || p.last_name, p.email) as assigned_by_name
    FROM red_escuelas re
    JOIN schools s ON s.id = re.school_id
    LEFT JOIN profiles p ON p.id = re.assigned_by
    WHERE re.red_id = network_id
    ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get supervisors for a network
CREATE OR REPLACE FUNCTION get_network_supervisors(network_id UUID)
RETURNS TABLE (
    user_id UUID,
    email VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    assigned_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.email,
        p.first_name,
        p.last_name,
        ur.assigned_at
    FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id
    WHERE ur.red_id = network_id 
    AND ur.role_type = 'supervisor_de_red'
    AND ur.is_active = true
    ORDER BY p.first_name, p.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 7. CREATE BASIC RLS POLICIES
-- ====================================================================

-- Enable RLS on new tables
ALTER TABLE redes_de_colegios ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_escuelas ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with networks
CREATE POLICY "networks_admin_all_access" ON redes_de_colegios
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'admin' 
            AND ur.is_active = true
        )
    );

-- Admins can manage all school-network assignments
CREATE POLICY "red_escuelas_admin_all_access" ON red_escuelas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'admin' 
            AND ur.is_active = true
        )
    );

-- Supervisors can read their assigned network info
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

-- Supervisors can read their network's school assignments
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

-- ====================================================================
-- 8. CREATE SAMPLE DATA (Optional - for testing)
-- ====================================================================

-- Insert a sample network (only if in development)
DO $$
BEGIN
    -- Only create sample data if we're in a development environment
    -- Check for a development indicator (like a specific admin user)
    IF EXISTS (SELECT 1 FROM profiles WHERE email = 'brent@perrotuertocm.cl') THEN
        -- Insert sample network
        INSERT INTO redes_de_colegios (name, description, created_by)
        SELECT 
            'Red de Prueba Norte', 
            'Red de colegios del norte para pruebas del sistema',
            id
        FROM profiles 
        WHERE email = 'brent@perrotuertocm.cl'
        ON CONFLICT (name) DO NOTHING;
        
        RAISE NOTICE 'Created sample network for development';
    END IF;
END
$$;

-- ====================================================================
-- 9. VERIFICATION QUERIES
-- ====================================================================

-- Verify enum was updated
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'supervisor_de_red' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_type')
    ) THEN
        RAISE NOTICE '✓ supervisor_de_red role type created successfully';
    ELSE
        RAISE EXCEPTION '✗ Failed to create supervisor_de_red role type';
    END IF;
END
$$;

-- Verify tables were created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'redes_de_colegios') THEN
        RAISE NOTICE '✓ redes_de_colegios table created successfully';
    ELSE
        RAISE EXCEPTION '✗ Failed to create redes_de_colegios table';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'red_escuelas') THEN
        RAISE NOTICE '✓ red_escuelas table created successfully';
    ELSE
        RAISE EXCEPTION '✗ Failed to create red_escuelas table';
    END IF;
END
$$;

-- Verify red_id column was added
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_roles' AND column_name = 'red_id'
    ) THEN
        RAISE NOTICE '✓ red_id column added to user_roles successfully';
    ELSE
        RAISE EXCEPTION '✗ Failed to add red_id column to user_roles';
    END IF;
END
$$;

COMMIT;

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================

-- Summary of changes:
-- ✓ Created redes_de_colegios table with full audit trail
-- ✓ Created red_escuelas table with composite primary key
-- ✓ Added supervisor_de_red to user_role_type enum
-- ✓ Added red_id column to user_roles table
-- ✓ Created performance indexes
-- ✓ Added audit triggers
-- ✓ Created utility functions
-- ✓ Implemented basic RLS policies
-- ✓ Added verification checks

-- Next steps:
-- 1. Apply this migration: psql -d your_db -f add-supervisor-de-red-role.sql
-- 2. Update TypeScript types in /types/roles.ts
-- 3. Update roleUtils.ts with network support
-- 4. Create API endpoints for network management
-- 5. Build admin UI for network management