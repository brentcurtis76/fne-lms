-- Ensure get_all_auth_users returns the highest priority active role

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
    s.name::TEXT AS school_name,
    p.approval_status::TEXT,
    (
      SELECT ur.role_type::TEXT
      FROM public.user_roles ur
      WHERE ur.user_id = au.id
        AND ur.is_active = TRUE
      ORDER BY
        CASE ur.role_type
          WHEN 'admin' THEN 1
          WHEN 'consultor' THEN 2
          WHEN 'equipo_directivo' THEN 3
          WHEN 'supervisor_de_red' THEN 4
          WHEN 'community_manager' THEN 5
          WHEN 'lider_generacion' THEN 6
          WHEN 'lider_comunidad' THEN 7
          WHEN 'docente' THEN 8
          ELSE 99
        END,
        ur.assigned_at DESC NULLS LAST,
        ur.created_at DESC NULLS LAST
      LIMIT 1
    ) AS role_type
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  WHERE au.deleted_at IS NULL
  ORDER BY au.id, au.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_auth_users() TO authenticated;
