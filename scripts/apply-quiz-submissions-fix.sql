-- Direct SQL script to fix quiz_submissions RLS policies
-- Run this in Supabase SQL editor if the Node.js script fails

-- First, check current policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'quiz_submissions';

-- Drop all existing policies on quiz_submissions
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'quiz_submissions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON quiz_submissions', pol.policyname);
    END LOOP;
END $$;

-- Recreate policies with correct column reference
CREATE POLICY "quiz_submissions_admin_all" ON quiz_submissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
        )
    );

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
            JOIN course_assignments ca ON ca.course_id = m.course_id
            WHERE l.id = quiz_submissions.lesson_id
            AND ca.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            JOIN course_assignments ca ON ca.course_id = m.course_id
            WHERE l.id = quiz_submissions.lesson_id
            AND ca.teacher_id = auth.uid()
        )
    );

-- Also ensure consultants can manage quiz submissions for their assigned students
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
            SELECT 1 FROM consultant_student_assignments csa
            WHERE csa.consultant_id = auth.uid()
            AND csa.student_id = quiz_submissions.student_id
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
            SELECT 1 FROM consultant_student_assignments csa
            WHERE csa.consultant_id = auth.uid()
            AND csa.student_id = quiz_submissions.student_id
        )
    );

-- Verify the fix
SELECT 
    schemaname,
    tablename,
    policyname,
    qual
FROM pg_policies 
WHERE tablename = 'quiz_submissions'
ORDER BY policyname;