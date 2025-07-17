-- Fix quiz_submissions RLS policies that incorrectly reference user_id instead of student_id
-- This migration corrects the column name mismatch that causes quiz submission errors

-- Drop the incorrect policies
DROP POLICY IF EXISTS "quiz_submissions_student_own" ON quiz_submissions;
DROP POLICY IF EXISTS "quiz_submissions_admin_all" ON quiz_submissions;
DROP POLICY IF EXISTS "quiz_submissions_teacher_manage" ON quiz_submissions;
DROP POLICY IF EXISTS "quiz_submissions_consultant_manage" ON quiz_submissions;

-- Also drop the original policies from the initial migration
DROP POLICY IF EXISTS "Students can view own quiz submissions" ON quiz_submissions;
DROP POLICY IF EXISTS "Students can submit quizzes" ON quiz_submissions;
DROP POLICY IF EXISTS "Teachers can view quiz submissions for their courses" ON quiz_submissions;
DROP POLICY IF EXISTS "Teachers can grade quiz submissions" ON quiz_submissions;

-- Recreate policies with correct column reference (student_id, not user_id)
CREATE POLICY "quiz_submissions_admin_all" ON quiz_submissions
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "quiz_submissions_student_own" ON quiz_submissions
    FOR ALL TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "quiz_submissions_teacher_manage" ON quiz_submissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = quiz_submissions.lesson_id
            AND auth_is_course_teacher(m.course_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = quiz_submissions.lesson_id
            AND auth_is_course_teacher(m.course_id)
        )
    );

-- Ensure consultants can view and grade quiz submissions for students in their courses
-- Using consultant_assignments table instead of non-existent consultant_student_assignments
CREATE POLICY "quiz_submissions_consultant_manage" ON quiz_submissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'consultor'
        )
        AND
        EXISTS (
            SELECT 1 FROM consultant_assignments ca
            WHERE ca.consultant_id = auth.uid()
            AND ca.student_id = quiz_submissions.student_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'consultor'
        )
        AND
        EXISTS (
            SELECT 1 FROM consultant_assignments ca
            WHERE ca.consultant_id = auth.uid()
            AND ca.student_id = quiz_submissions.student_id
        )
    );

-- Verify the submit_quiz function is using the correct column
-- The function should already be correct, but let's add a comment for clarity
COMMENT ON FUNCTION submit_quiz IS 'Submits a quiz with auto-grading. Uses student_id parameter which maps to the student_id column in quiz_submissions table.';