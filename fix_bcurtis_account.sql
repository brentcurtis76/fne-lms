-- Fix bcurtis@nuevaeducacion.org account specifically
-- First, check if the account exists
SELECT email, created_at FROM auth.users WHERE email = 'bcurtis@nuevaeducacion.org';

-- Delete the account if it exists and recreate it
DELETE FROM public.profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'bcurtis@nuevaeducacion.org');
DELETE FROM auth.users WHERE email = 'bcurtis@nuevaeducacion.org';

-- Create the account fresh
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_sent_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  confirmed_at,
  email_change_token_current_deadline,
  email_change_token_new_deadline,
  is_sso_user,
  deleted_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'bcurtis@nuevaeducacion.org',
  crypt('demo123', gen_salt('bf')),
  now(),
  now(),
  '',
  '',
  '',
  '',
  now(),
  '',
  0,
  now(),
  now(),
  null,
  null,
  '',
  '',
  now(),
  now(),
  null,
  null,
  false,
  null
);

-- Create the profile
INSERT INTO public.profiles (user_id, email, role, full_name, created_at, updated_at)
SELECT 
  u.id,
  u.email,
  'docente' as role,
  'Brent Curtis' as full_name,
  now() as created_at,
  now() as updated_at
FROM auth.users u 
WHERE u.email = 'bcurtis@nuevaeducacion.org';

-- Verify the account was created
SELECT 
  u.email,
  p.role,
  p.full_name,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE u.email = 'bcurtis@nuevaeducacion.org';