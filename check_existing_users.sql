-- Check existing team accounts
SELECT email, created_at FROM auth.users 
WHERE email IN (
  'acisternas@nuevaeducacion.org', 
  'mdelfresno@nuevaeducacion.org', 
  'gnaranjo@nuevaeducacion.org', 
  'arnoldocisternas@gmail.com', 
  'moradelfresno@gmail.com', 
  'gnaranjoarmas@gmail.com', 
  'bcurtis@nuevaeducacion.org'
) 
ORDER BY email;