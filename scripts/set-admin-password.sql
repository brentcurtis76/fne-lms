-- Set password for admin user bcurtis@nuevaeducacion.org
-- This script updates the auth.users table in Supabase
-- The password will be set to: FNE2025admin!

-- First, check if the user exists
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'bcurtis@nuevaeducacion.org';

-- Update the password for the user
-- Note: In Supabase, you typically need to use the encrypted_password field
-- The password 'FNE2025admin!' is hashed using bcrypt
UPDATE auth.users 
SET 
    encrypted_password = crypt('FNE2025admin!', gen_salt('bf')),
    updated_at = now()
WHERE email = 'bcurtis@nuevaeducacion.org';

-- Verify the update
SELECT id, email, updated_at 
FROM auth.users 
WHERE email = 'bcurtis@nuevaeducacion.org';

-- Alternative: If you need to create the user entirely
-- INSERT INTO auth.users (
--     instance_id,
--     id,
--     aud,
--     role,
--     email,
--     encrypted_password,
--     email_confirmed_at,
--     created_at,
--     updated_at
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000000',
--     gen_random_uuid(),
--     'authenticated',
--     'authenticated',
--     'bcurtis@nuevaeducacion.org',
--     crypt('FNE2025admin!', gen_salt('bf')),
--     now(),
--     now(),
--     now()
-- ) ON CONFLICT (email) DO NOTHING;