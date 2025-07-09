-- Add missing admin role for brentcurtis76@gmail.com
-- This user was found to have no role in the user_roles table

-- First verify the user exists
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get the user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'brentcurtis76@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email brentcurtis76@gmail.com not found';
  END IF;
  
  -- Check if user already has any roles
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id 
    AND is_active = true
  ) THEN
    RAISE NOTICE 'User already has active roles. Skipping...';
    RETURN;
  END IF;
  
  -- Insert admin role
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
    v_user_id -- Self-assigned
  );
  
  RAISE NOTICE 'Admin role successfully added for brentcurtis76@gmail.com (ID: %)', v_user_id;
END $$;