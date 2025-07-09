-- =====================================================================
-- Create Admin User: Jorge Parra
-- Email: jorge@lospellines.cl
-- Password: FNE123!
-- =====================================================================
-- NOTE: This script creates the user in Supabase Auth and assigns admin role
-- =====================================================================

-- IMPORTANT: User creation in Supabase Auth must be done through:
-- 1. Supabase Dashboard (Authentication > Users > Create User)
-- 2. Supabase Auth API
-- 3. Application signup flow

-- This script assumes the user has been created in Supabase Auth
-- and we're adding their profile and role information

DO $$
DECLARE
    v_user_id UUID;
    v_email TEXT := 'jorge@lospellines.cl';
BEGIN
    -- First, check if user exists in auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_email;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'User % not found in auth.users', v_email;
        RAISE NOTICE 'Please create the user first through:';
        RAISE NOTICE '1. Supabase Dashboard: Authentication > Users > Create User';
        RAISE NOTICE '2. Or use the application signup flow';
        RAISE NOTICE 'Password: FNE123!';
        RETURN;
    END IF;
    
    -- Create or update profile
    INSERT INTO profiles (
        id,
        email,
        first_name,
        last_name,
        approval_status,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_email,
        'Jorge',
        'Parra',
        'approved',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        approval_status = EXCLUDED.approval_status,
        updated_at = NOW();
    
    -- Assign admin role
    INSERT INTO user_roles (
        user_id,
        role_type,
        is_active,
        created_at,
        created_by
    ) VALUES (
        v_user_id,
        'admin',
        true,
        NOW(),
        v_user_id
    )
    ON CONFLICT (user_id, role_type) DO UPDATE SET
        is_active = true,
        updated_at = NOW();
    
    RAISE NOTICE 'Successfully configured Jorge Parra as admin';
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE 'Email: %', v_email;
    RAISE NOTICE 'Role: admin';
    
END $$;

-- =====================================================================
-- Manual Steps Required:
-- =====================================================================
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Create User"
-- 3. Enter:
--    - Email: jorge@lospellines.cl
--    - Password: FNE123!
--    - Auto Confirm User: Yes (checked)
-- 4. Click "Create User"
-- 5. Run this SQL script to assign admin role
-- =====================================================================