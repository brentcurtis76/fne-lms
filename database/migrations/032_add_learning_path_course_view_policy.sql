-- Migration: Add RLS policy for viewing courses in assigned learning paths
-- Created: 2025-11-26
-- Purpose: Allow users to view courses that are part of their assigned learning paths
-- This prevents the "Curso sin título" bug when users are assigned to a learning path
-- but not yet enrolled in all courses

-- =============================================
-- HELPER FUNCTION: Check if user is assigned to a learning path containing a course
-- =============================================

-- Drop if exists to allow re-running
DROP FUNCTION IF EXISTS public.auth_is_learning_path_member(UUID);

-- Create the helper function
CREATE OR REPLACE FUNCTION public.auth_is_learning_path_member(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Check if the course is in any learning path the user is assigned to
    SELECT 1
    FROM learning_path_courses lpc
    JOIN learning_path_assignments lpa ON lpa.path_id = lpc.learning_path_id
    LEFT JOIN user_roles ur ON ur.community_id = lpa.group_id AND ur.user_id = auth.uid() AND ur.is_active = true
    WHERE lpc.course_id = p_course_id
    AND (
      -- Direct user assignment
      lpa.user_id = auth.uid()
      OR
      -- Group assignment (user is member of the group)
      (lpa.group_id IS NOT NULL AND ur.user_id IS NOT NULL)
    )
  );
$$;

-- Add comment
COMMENT ON FUNCTION public.auth_is_learning_path_member IS
'Checks if the current user is assigned to any learning path containing the specified course.
Used for RLS policies to allow viewing courses in assigned learning paths.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.auth_is_learning_path_member(UUID) TO authenticated;

-- =============================================
-- ADD NEW RLS POLICY FOR COURSES TABLE
-- =============================================

-- Drop existing policy if it exists (to allow re-running)
DROP POLICY IF EXISTS "courses_learning_path_member_view" ON courses;

-- Create the new policy
CREATE POLICY "courses_learning_path_member_view" ON courses
    FOR SELECT TO authenticated
    USING (
        auth_is_learning_path_member(courses.id)
    );

-- Add comment
COMMENT ON POLICY "courses_learning_path_member_view" ON courses IS
'Allows users assigned to a learning path to view all courses in that path,
even if they are not yet enrolled in the course. This prevents the "Curso sin título" bug.';

-- =============================================
-- VERIFICATION
-- =============================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 032: Learning path course view policy created successfully';
    RAISE NOTICE 'Users assigned to learning paths can now view all courses in their assigned paths';
END $$;
