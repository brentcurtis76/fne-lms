-- Create function to find duplicate Santa Marta roles
DROP FUNCTION IF EXISTS get_duplicate_santa_marta_roles();

CREATE OR REPLACE FUNCTION get_duplicate_santa_marta_roles()
RETURNS TABLE (
  user_id UUID,
  role_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ur.user_id, COUNT(*)::INTEGER as role_count
  FROM user_roles ur
  WHERE ur.user_id IN (
    SELECT id FROM auth.users 
    WHERE email LIKE '%@colegiosantamartavaldivia.cl'
  )
  GROUP BY ur.user_id
  HAVING COUNT(*) > 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_duplicate_santa_marta_roles() TO authenticated;