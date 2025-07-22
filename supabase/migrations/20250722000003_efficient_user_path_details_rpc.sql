-- Migration: Efficient RPC function for user path details with progress
-- Purpose: Replace multiple individual queries with a single optimized database function
-- Eliminates N+1 query problem in getLearningPathDetailsForUser service method

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_user_path_details_with_progress(uuid, uuid);

-- Create comprehensive function to get all user path details in one call
CREATE OR REPLACE FUNCTION get_user_path_details_with_progress(
  p_user_id UUID,
  p_path_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  path_record RECORD;
  course_record RECORD;
  assignment_record RECORD;
  courses_data JSON[] := '{}';
  total_courses INTEGER := 0;
  completed_courses INTEGER := 0;
  progress_percentage DECIMAL;
BEGIN
  -- Validate input parameters
  IF p_user_id IS NULL OR p_path_id IS NULL THEN
    RAISE EXCEPTION 'User ID and Path ID are required';
  END IF;

  -- Get the main learning path details
  SELECT 
    lp.id,
    lp.name,
    lp.description,
    lp.created_at,
    lp.updated_at
  INTO path_record
  FROM learning_paths lp
  WHERE lp.id = p_path_id;

  -- Check if path exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Learning path not found';
  END IF;

  -- Get assignment details with time tracking
  SELECT 
    lpa.started_at,
    lpa.completed_at,
    lpa.last_activity_at,
    lpa.total_time_spent_minutes,
    lpa.estimated_completion_minutes,
    lpa.current_course_sequence
  INTO assignment_record
  FROM learning_path_assignments lpa
  WHERE lpa.user_id = p_user_id 
    AND lpa.path_id = p_path_id;

  -- Build courses array with progress data using a single comprehensive query
  FOR course_record IN
    WITH course_progress AS (
      SELECT 
        lpc.course_id,
        lpc.sequence_order,
        c.id as course_table_id,
        c.title,
        c.description,
        c.category,
        c.duration_hours,
        c.difficulty_level,
        -- Enrollment data (left join to handle non-enrolled courses)
        ce.progress_percentage,
        ce.status as enrollment_status,
        ce.completed_at as enrollment_completed_at,
        ce.enrolled_at,
        -- Determine course status based on enrollment
        CASE 
          WHEN ce.progress_percentage >= 100 THEN 'completed'
          WHEN ce.progress_percentage > 0 THEN 'in_progress'
          WHEN ce.enrolled_at IS NOT NULL THEN 'enrolled'
          ELSE 'not_started'
        END as computed_status,
        -- Determine button text and variant
        CASE 
          WHEN ce.progress_percentage >= 100 THEN 'Revisar'
          WHEN ce.progress_percentage > 0 THEN 'Continuar'
          WHEN ce.enrolled_at IS NOT NULL THEN 'Comenzar'
          ELSE 'Iniciar Curso'
        END as button_text,
        CASE 
          WHEN ce.progress_percentage >= 100 THEN 'secondary'
          WHEN ce.progress_percentage > 0 THEN 'primary'
          ELSE 'default'
        END as button_variant
      FROM learning_path_courses lpc
      INNER JOIN courses c ON c.id = lpc.course_id
      LEFT JOIN course_enrollments ce ON ce.course_id = lpc.course_id AND ce.user_id = p_user_id
      WHERE lpc.learning_path_id = p_path_id
      ORDER BY lpc.sequence_order ASC
    )
    SELECT * FROM course_progress
  LOOP
    -- Build course JSON object
    courses_data := courses_data || json_build_object(
      'sequence', course_record.sequence_order,
      'course_id', course_record.course_id,
      'title', course_record.title,
      'description', course_record.description,
      'category', course_record.category,
      'duration_hours', course_record.duration_hours,
      'difficulty_level', course_record.difficulty_level,
      'status', course_record.computed_status,
      'completion_rate', COALESCE(course_record.progress_percentage, 0),
      'last_accessed', course_record.enrollment_completed_at,
      'enrolled_at', course_record.enrolled_at,
      'enrollment_status', course_record.enrollment_status,
      'buttonText', course_record.button_text,
      'buttonVariant', course_record.button_variant
    );

    -- Count courses for progress calculation
    total_courses := total_courses + 1;
    IF course_record.computed_status = 'completed' THEN
      completed_courses := completed_courses + 1;
    END IF;
  END LOOP;

  -- Calculate overall progress percentage
  progress_percentage := CASE 
    WHEN total_courses > 0 THEN ROUND((completed_courses::DECIMAL / total_courses::DECIMAL) * 100, 0)
    ELSE 0 
  END;

  -- Build the final result JSON
  result := json_build_object(
    -- Learning path basic info
    'id', path_record.id,
    'name', path_record.name,
    'description', path_record.description,
    'created_at', path_record.created_at,
    'updated_at', path_record.updated_at,
    
    -- Courses with progress
    'courses', array_to_json(courses_data),
    
    -- Overall progress summary
    'progress', json_build_object(
      'total_courses', total_courses,
      'completed_courses', completed_courses,
      'progress_percentage', progress_percentage
    ),
    
    -- Time tracking data
    'timeTracking', json_build_object(
      'totalTimeSpent', COALESCE(assignment_record.total_time_spent_minutes, 0),
      'estimatedCompletion', assignment_record.estimated_completion_minutes,
      'startedAt', assignment_record.started_at,
      'completedAt', assignment_record.completed_at,
      'lastActivity', assignment_record.last_activity_at
    )
  );

  RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_path_details_with_progress(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_path_details_with_progress(UUID, UUID) TO service_role;

-- Add helpful comment
COMMENT ON FUNCTION get_user_path_details_with_progress(UUID, UUID) IS 
'Efficiently retrieves complete learning path details with user progress in a single database call. 
Eliminates N+1 query problems by performing all joins and calculations database-side.
Returns JSON with path info, courses array with progress, overall progress summary, and time tracking.';

-- Create index to optimize the RPC function performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learning_path_assignments_user_path_lookup 
ON learning_path_assignments(user_id, path_id) 
INCLUDE (started_at, completed_at, last_activity_at, total_time_spent_minutes, estimated_completion_minutes, current_course_sequence);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_course_enrollments_user_course_lookup 
ON course_enrollments(user_id, course_id) 
INCLUDE (progress_percentage, status, completed_at, enrolled_at);