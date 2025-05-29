-- Reset all team account passwords to demo123
UPDATE auth.users 
SET 
  encrypted_password = crypt('demo123', gen_salt('bf')),
  updated_at = now()
WHERE email IN (
  'gnaranjoarmas@gmail.com',
  'arnoldocisternas@gmail.com', 
  'moradelfresno@gmail.com',
  'bcurtis@nuevaeducacion.org',
  'gnaranjo@nuevaeducacion.org',
  'acisternas@nuevaeducacion.org',
  'mdelfresno@nuevaeducacion.org'
);

-- Verify the update
SELECT email, updated_at FROM auth.users 
WHERE email IN (
  'gnaranjoarmas@gmail.com',
  'arnoldocisternas@gmail.com', 
  'moradelfresno@gmail.com',
  'bcurtis@nuevaeducacion.org',
  'gnaranjo@nuevaeducacion.org',
  'acisternas@nuevaeducacion.org',
  'mdelfresno@nuevaeducacion.org'
)
ORDER BY email;