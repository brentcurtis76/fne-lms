-- Migration: Fix auth_is_course_student to use correct column name
-- Created: 2025-10-07
-- Issue: Function checks 'student_id' but column is actually 'user_id'

CREATE OR REPLACE FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid")
RETURNS boolean
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM course_enrollments ce
        WHERE ce.course_id = p_course_id
        AND ce.user_id = auth.uid()  -- Fixed: was student_id, now user_id
    );
END;
$$;

COMMENT ON FUNCTION "public"."auth_is_course_student" IS
'Fixed 2025-10-07: Changed student_id to user_id to match actual column name in course_enrollments table';
