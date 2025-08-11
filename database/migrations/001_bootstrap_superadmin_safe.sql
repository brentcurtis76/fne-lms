-- ============================================================================
-- SAFE BOOTSTRAP SCRIPT - Handles existing objects gracefully
-- Run this instead of 001_bootstrap_superadmin.sql if you get errors
-- ============================================================================

-- 1. First, clean up any existing functions with different signatures
DROP FUNCTION IF EXISTS auth_is_superadmin(uuid) CASCADE;
DROP FUNCTION IF EXISTS auth_is_superadmin() CASCADE;

-- 2. Create superadmins table (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS superadmins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true,
    notes TEXT
);

-- 3. Create test mode table (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS superadmin_test_mode (
    id SERIAL PRIMARY KEY,
    enabled BOOLEAN DEFAULT false,
    enabled_by UUID REFERENCES auth.users(id),
    enabled_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    notes TEXT
);

-- 4. Create permission overlays table (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS superadmin_permission_overlays (
    id SERIAL PRIMARY KEY,
    role_name TEXT NOT NULL,
    permission_name TEXT NOT NULL,
    original_value BOOLEAN,
    overlay_value BOOLEAN NOT NULL,
    applied_by UUID REFERENCES auth.users(id),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    test_mode_only BOOLEAN DEFAULT true,
    UNIQUE(role_name, permission_name)
);

-- 5. Enable RLS (safe to run multiple times)
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE superadmin_test_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE superadmin_permission_overlays ENABLE ROW LEVEL SECURITY;

-- 6. Create the auth helper function (fresh creation)
CREATE OR REPLACE FUNCTION auth_is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM superadmins 
        WHERE user_id = auth.uid() 
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Drop existing policies before recreating them
DROP POLICY IF EXISTS "Superadmins can read all superadmin records" ON superadmins;
DROP POLICY IF EXISTS "Superadmins can manage all superadmin records" ON superadmins;
DROP POLICY IF EXISTS "Superadmins can read test mode settings" ON superadmin_test_mode;
DROP POLICY IF EXISTS "Superadmins can manage test mode settings" ON superadmin_test_mode;
DROP POLICY IF EXISTS "Superadmins can read permission overlays" ON superadmin_permission_overlays;
DROP POLICY IF EXISTS "Superadmins can manage permission overlays" ON superadmin_permission_overlays;

-- 8. Create RLS policies
CREATE POLICY "Superadmins can read all superadmin records"
    ON superadmins FOR SELECT
    USING (auth_is_superadmin());

CREATE POLICY "Superadmins can manage all superadmin records"
    ON superadmins FOR ALL
    USING (auth_is_superadmin())
    WITH CHECK (auth_is_superadmin());

CREATE POLICY "Superadmins can read test mode settings"
    ON superadmin_test_mode FOR SELECT
    USING (auth_is_superadmin());

CREATE POLICY "Superadmins can manage test mode settings"
    ON superadmin_test_mode FOR ALL
    USING (auth_is_superadmin())
    WITH CHECK (auth_is_superadmin());

CREATE POLICY "Superadmins can read permission overlays"
    ON superadmin_permission_overlays FOR SELECT
    USING (auth_is_superadmin());

CREATE POLICY "Superadmins can manage permission overlays"
    ON superadmin_permission_overlays FOR ALL
    USING (auth_is_superadmin())
    WITH CHECK (auth_is_superadmin());

-- 9. Bootstrap Brent as superadmin (safe - won't duplicate)
INSERT INTO superadmins (user_id, granted_by, notes)
SELECT 
    id,
    id,
    'Bootstrap superadmin - system initialization'
FROM auth.users
WHERE email = 'brentcurtis76@gmail.com'
ON CONFLICT (user_id) 
DO UPDATE SET 
    is_active = true,
    notes = 'Reactivated - ' || CURRENT_TIMESTAMP;

-- 10. Grant execution permissions
GRANT EXECUTE ON FUNCTION auth_is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_is_superadmin() TO service_role;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'RBAC Phase 0 bootstrap completed successfully!';
    RAISE NOTICE 'Superadmin table created and Brent has been granted superadmin access.';
END $$;