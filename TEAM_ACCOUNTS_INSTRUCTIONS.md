# Team Accounts Setup Instructions

The duplicate key error indicates that `acisternas@nuevaeducacion.org` already exists in your database. Here's how to fix all team accounts:

## Option 1: Manual Database Fix (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run this SQL script:

```sql
-- Update existing accounts with demo123 password
UPDATE auth.users 
SET 
  encrypted_password = crypt('demo123', gen_salt('bf')),
  email_confirmed_at = now(),
  confirmed_at = now(),
  email_change_confirm_status = 0,
  updated_at = now()
WHERE email IN (
  'acisternas@nuevaeducacion.org', 
  'mdelfresno@nuevaeducacion.org', 
  'gnaranjo@nuevaeducacion.org', 
  'arnoldocisternas@gmail.com', 
  'moradelfresno@gmail.com', 
  'gnaranjoarmas@gmail.com', 
  'bcurtis@nuevaeducacion.org'
);

-- Insert new accounts that don't exist yet
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, confirmation_sent_at, confirmation_token, 
  recovery_token, email_change_token_new, email_change, 
  email_change_sent_at, email_change_token_current, 
  email_change_confirm_status, created_at, updated_at, 
  phone, phone_confirmed_at, phone_change, phone_change_token, 
  phone_change_sent_at, confirmed_at, email_change_token_current_deadline, 
  email_change_token_new_deadline, is_sso_user, deleted_at
) VALUES
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'acisternas@nuevaeducacion.org', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mdelfresno@nuevaeducacion.org', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'gnaranjo@nuevaeducacion.org', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'arnoldocisternas@gmail.com', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'moradelfresno@gmail.com', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'gnaranjoarmas@gmail.com', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null),
('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'bcurtis@nuevaeducacion.org', crypt('demo123', gen_salt('bf')), now(), now(), '', '', '', '', now(), '', 0, now(), now(), null, null, '', '', now(), now(), null, null, false, null)
ON CONFLICT (email) DO NOTHING;

-- Delete existing profiles to avoid conflicts
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN (
    'acisternas@nuevaeducacion.org', 'mdelfresno@nuevaeducacion.org', 'gnaranjo@nuevaeducacion.org', 
    'arnoldocisternas@gmail.com', 'moradelfresno@gmail.com', 'gnaranjoarmas@gmail.com', 'bcurtis@nuevaeducacion.org'
  )
);

-- Create profiles for all team accounts
INSERT INTO public.profiles (user_id, email, role, full_name, created_at, updated_at)
SELECT 
  u.id, u.email,
  CASE 
    WHEN u.email IN ('acisternas@nuevaeducacion.org', 'mdelfresno@nuevaeducacion.org', 'gnaranjo@nuevaeducacion.org') THEN 'admin'
    ELSE 'docente'
  END as role,
  CASE 
    WHEN u.email = 'acisternas@nuevaeducacion.org' THEN 'Arnoldo Cisternas'
    WHEN u.email = 'mdelfresno@nuevaeducacion.org' THEN 'Mora Del Fresno'
    WHEN u.email = 'gnaranjo@nuevaeducacion.org' THEN 'Gabriela Naranjo'
    WHEN u.email = 'arnoldocisternas@gmail.com' THEN 'Arnoldo Cisternas'
    WHEN u.email = 'moradelfresno@gmail.com' THEN 'Mora Del Fresno'
    WHEN u.email = 'gnaranjoarmas@gmail.com' THEN 'Gabriela Naranjo'
    WHEN u.email = 'bcurtis@nuevaeducacion.org' THEN 'Brent Curtis'
  END as full_name,
  now(), now()
FROM auth.users u 
WHERE u.email IN (
  'acisternas@nuevaeducacion.org', 'mdelfresno@nuevaeducacion.org', 'gnaranjo@nuevaeducacion.org', 
  'arnoldocisternas@gmail.com', 'moradelfresno@gmail.com', 'gnaranjoarmas@gmail.com', 'bcurtis@nuevaeducacion.org'
);
```

## Team Login Credentials

After running the script above, your team can log in with these credentials:

### Admin Accounts (password: demo123)
- acisternas@nuevaeducacion.org
- mdelfresno@nuevaeducacion.org  
- gnaranjo@nuevaeducacion.org

### Docente Accounts (password: demo123)
- arnoldocisternas@gmail.com
- moradelfresno@gmail.com
- gnaranjoarmas@gmail.com
- bcurtis@nuevaeducacion.org

### Your Account (unchanged)
- brent@perrotuertocm.cl (password: Brent123!)

## Verification

After running the script, you can verify all accounts were created by running:

```sql
SELECT u.email, p.role, p.full_name, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE u.email IN (
  'acisternas@nuevaeducacion.org', 'mdelfresno@nuevaeducacion.org', 'gnaranjo@nuevaeducacion.org', 
  'arnoldocisternas@gmail.com', 'moradelfresno@gmail.com', 'gnaranjoarmas@gmail.com', 'bcurtis@nuevaeducacion.org'
)
ORDER BY u.email;
```

This should show all 7 team accounts with their correct roles and names.