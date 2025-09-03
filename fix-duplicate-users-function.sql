-- FIX THE get_all_auth_users FUNCTION TO PREVENT DUPLICATES
-- The issue is that JOINing with user_roles creates multiple rows per user

DROP FUNCTION IF EXISTS get_all_auth_users();

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
  SELECT DISTINCT ON (au.id)
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
    -- Get the first role for each user (if multiple exist)
    COALESCE(
      (SELECT ur.role_type::TEXT 
       FROM public.user_roles ur 
       WHERE ur.user_id = au.id 
       LIMIT 1),
      NULL
    ) as role_type
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  WHERE au.deleted_at IS NULL
  ORDER BY au.id, au.created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_all_auth_users() TO authenticated;

-- Test the function to ensure no duplicates
SELECT 
  COUNT(*) as total_rows,
  COUNT(DISTINCT id) as unique_users,
  COUNT(*) - COUNT(DISTINCT id) as duplicates
FROM get_all_auth_users();

-- Show count by domain
SELECT 
  CASE 
    WHEN email LIKE '%@colegiosantamartavaldivia.cl' THEN 'Santa Marta'
    WHEN email LIKE '%@liceonacionaldelllolleo.cl' THEN 'Liceo Nacional' 
    WHEN email LIKE '%@institucionsweet.cl' THEN 'Institución Sweet'
    ELSE 'Other'
  END as school_domain,
  COUNT(*) as user_count
FROM get_all_auth_users()
GROUP BY school_domain
ORDER BY user_count DESC;