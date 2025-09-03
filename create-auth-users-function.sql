-- CREATE A FUNCTION TO ACCESS ALL AUTH USERS DIRECTLY
-- This bypasses the Supabase Admin API limitations

-- Drop if exists
DROP FUNCTION IF EXISTS get_all_auth_users();

-- Create function that returns auth user data
CREATE OR REPLACE FUNCTION get_all_auth_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  first_name TEXT,
  last_name TEXT,
  school_id INTEGER,
  school_name TEXT,
  approval_status TEXT,
  role_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email::TEXT,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    p.first_name::TEXT,
    p.last_name::TEXT,
    p.school_id,
    s.name::TEXT as school_name,
    p.approval_status::TEXT,
    ur.role_type::TEXT
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  LEFT JOIN public.user_roles ur ON au.id = ur.user_id
  WHERE au.deleted_at IS NULL
  ORDER BY au.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_auth_users() TO authenticated;

-- Test it
SELECT COUNT(*) as total_users FROM get_all_auth_users();
SELECT COUNT(*) as santa_marta_users FROM get_all_auth_users() WHERE email LIKE '%@colegiosantamartavaldivia.cl';

-- Show sample of Santa Marta users
SELECT 
  email,
  first_name,
  last_name,
  school_name,
  role_type
FROM get_all_auth_users() 
WHERE email LIKE '%@colegiosantamartavaldivia.cl'
LIMIT 10;