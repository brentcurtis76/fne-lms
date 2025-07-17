
-- Create wrapper functions that PostgREST might recognize better

-- Wrapper for get_learning_paths
CREATE OR REPLACE FUNCTION public.fetch_learning_paths()
RETURNS SETOF json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT row_to_json(t) FROM (
    SELECT 
      lp.id,
      lp.name,
      lp.description,
      lp.icon,
      lp.total_duration,
      COUNT(DISTINCT lpc.course_id) as course_count,
      lp.created_at
    FROM learning_paths lp
    LEFT JOIN learning_path_courses lpc ON lp.id = lpc.learning_path_id
    WHERE lp.is_active = true
    GROUP BY lp.id, lp.name, lp.description, lp.icon, lp.total_duration, lp.created_at
    ORDER BY lp.created_at DESC
  ) t;
$$;

-- Wrapper for get_student_learning_paths
CREATE OR REPLACE FUNCTION public.fetch_student_learning_paths(user_id uuid)
RETURNS SETOF json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT row_to_json(t) FROM (
    SELECT 
      lp.id as learning_path_id,
      lp.name as learning_path_name,
      lp.description as learning_path_description,
      lp.icon as learning_path_icon,
      COUNT(DISTINCT lpc.course_id) as total_courses,
      COUNT(DISTINCT CASE WHEN ulpp.completed_at IS NOT NULL THEN lpc.course_id END) as completed_courses,
      COALESCE(AVG(ulpp.progress), 0) as progress,
      ulp.enrolled_at,
      ulp.completed_at
    FROM user_learning_paths ulp
    JOIN learning_paths lp ON ulp.learning_path_id = lp.id
    LEFT JOIN learning_path_courses lpc ON lp.id = lpc.learning_path_id
    LEFT JOIN user_learning_path_progress ulpp ON ulp.id = ulpp.user_learning_path_id AND ulpp.course_id = lpc.course_id
    WHERE ulp.user_id = $1 AND lp.is_active = true
    GROUP BY lp.id, lp.name, lp.description, lp.icon, ulp.enrolled_at, ulp.completed_at
    ORDER BY ulp.enrolled_at DESC
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_learning_paths() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_student_learning_paths(uuid) TO anon, authenticated;
