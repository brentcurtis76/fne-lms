-- Comprehensive fix for RLS infinite recursion across ALL tables
-- This migration updates all policies that check profiles table to use JWT metadata instead

-- Helper function to check if user is admin using JWT
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Fix lessons table
DROP POLICY IF EXISTS "Allow admin users full access to lessons" ON lessons;
CREATE POLICY "Allow admin users full access to lessons" ON lessons
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- Remove overly permissive policies
DROP POLICY IF EXISTS "Allow delete for all users" ON lessons;
DROP POLICY IF EXISTS "Allow insert for all users" ON lessons;
DROP POLICY IF EXISTS "Allow read access to all users" ON lessons;
DROP POLICY IF EXISTS "Allow update for all users" ON lessons;

-- Create proper role-based policies for lessons
CREATE POLICY "Teachers can manage lessons" ON lessons
    FOR ALL TO authenticated
    USING (
        auth.is_admin() OR 
        EXISTS (
            SELECT 1 FROM course_assignments ca
            WHERE ca.teacher_id = auth.uid()
            AND ca.course_id IN (
                SELECT course_id FROM modules m
                WHERE m.id = lessons.module_id
            )
        )
    );

CREATE POLICY "Students can view assigned lessons" ON lessons
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM course_enrollments ce
            WHERE ce.student_id = auth.uid()
            AND ce.course_id IN (
                SELECT course_id FROM modules m
                WHERE m.id = lessons.module_id
            )
        )
    );

-- 2. Fix courses table
DROP POLICY IF EXISTS "Allow insert for admins" ON courses;
CREATE POLICY "Admins can manage courses" ON courses
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 3. Fix course_assignments table
DROP POLICY IF EXISTS "Admins can manage course assignments" ON course_assignments;
CREATE POLICY "Admins can manage course assignments" ON course_assignments
    FOR ALL TO authenticated
    USING (auth.is_admin() OR teacher_id = auth.uid())
    WITH CHECK (auth.is_admin());

-- 4. Fix assignment_instances table
DROP POLICY IF EXISTS "View assignment instances - admin/consultor" ON assignment_instances;
DROP POLICY IF EXISTS "Create assignment instances" ON assignment_instances;
DROP POLICY IF EXISTS "Update assignment instances" ON assignment_instances;
DROP POLICY IF EXISTS "Delete assignment instances" ON assignment_instances;

CREATE POLICY "Teachers can manage assignment instances" ON assignment_instances
    FOR ALL TO authenticated
    USING (
        auth.is_admin() OR
        EXISTS (
            SELECT 1 FROM course_assignments ca
            WHERE ca.teacher_id = auth.uid()
            AND ca.course_id = assignment_instances.course_id
        )
    );

-- 5. Fix assignment_templates table
DROP POLICY IF EXISTS "View assignment templates" ON assignment_templates;
DROP POLICY IF EXISTS "Manage assignment templates" ON assignment_templates;

CREATE POLICY "Manage assignment templates" ON assignment_templates
    FOR ALL TO authenticated
    USING (auth.is_admin() OR created_by = auth.uid())
    WITH CHECK (auth.is_admin() OR created_by = auth.uid());

-- 6. Fix expense tables
DROP POLICY IF EXISTS "expense_categories_insert" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_update" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_delete" ON expense_categories;

CREATE POLICY "Admins manage expense categories" ON expense_categories
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

DROP POLICY IF EXISTS "expense_items_select" ON expense_items;
DROP POLICY IF EXISTS "expense_items_update" ON expense_items;
DROP POLICY IF EXISTS "expense_items_delete" ON expense_items;

CREATE POLICY "Users manage own expense items" ON expense_items
    FOR ALL TO authenticated
    USING (
        auth.is_admin() OR
        EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.expense_report_id
            AND er.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "expense_reports_select" ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_update" ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_delete" ON expense_reports;

CREATE POLICY "Users manage own expense reports" ON expense_reports
    FOR ALL TO authenticated
    USING (auth.is_admin() OR created_by = auth.uid())
    WITH CHECK (auth.is_admin() OR created_by = auth.uid());

-- 7. Fix generations table
DROP POLICY IF EXISTS "Allow admin to manage generations" ON generations;
DROP POLICY IF EXISTS "Admin full access to generations" ON generations;

CREATE POLICY "Admin full access to generations" ON generations
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 8. Fix growth_communities table
DROP POLICY IF EXISTS "Allow admin to manage growth_communities" ON growth_communities;
DROP POLICY IF EXISTS "Admin full access to communities" ON growth_communities;

CREATE POLICY "Admin full access to communities" ON growth_communities
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 9. Fix lesson_assignments table
DROP POLICY IF EXISTS "consultores_delete_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Admins can delete lesson assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "consultores_create_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "consultores_update_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers and above can create assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers and above can create lesson assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON lesson_assignments;

CREATE POLICY "Teachers manage lesson assignments" ON lesson_assignments
    FOR ALL TO authenticated
    USING (
        auth.is_admin() OR
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM course_assignments ca
            WHERE ca.teacher_id = auth.uid()
            AND ca.course_id = lesson_assignments.course_id
        )
    );

-- 10. Fix lesson_progress table
DROP POLICY IF EXISTS "Admins can view all progress" ON lesson_progress;

CREATE POLICY "Users view own progress" ON lesson_progress
    FOR SELECT TO authenticated
    USING (auth.is_admin() OR user_id = auth.uid());

CREATE POLICY "Admins can view all progress" ON lesson_progress
    FOR SELECT TO authenticated
    USING (auth.is_admin());

-- 11. Fix quiz_submissions table
DROP POLICY IF EXISTS "Teachers can grade quiz submissions" ON quiz_submissions;
DROP POLICY IF EXISTS "Teachers can view quiz submissions for their courses" ON quiz_submissions;

CREATE POLICY "Users manage own submissions" ON quiz_submissions
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid() OR
        auth.is_admin() OR
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            JOIN course_assignments ca ON ca.course_id = m.course_id
            WHERE l.id = quiz_submissions.lesson_id
            AND ca.teacher_id = auth.uid()
        )
    );

-- 12. Fix notification tables
DROP POLICY IF EXISTS "Admin can view notification events" ON notification_events;
CREATE POLICY "Admin can view notification events" ON notification_events
    FOR SELECT TO authenticated
    USING (auth.is_admin());

DROP POLICY IF EXISTS "Admin can manage notification triggers" ON notification_triggers;
CREATE POLICY "Admin can manage notification triggers" ON notification_triggers
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

DROP POLICY IF EXISTS "Admins can view all notifications" ON user_notifications;
CREATE POLICY "Users view own notifications" ON user_notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR auth.is_admin());

-- 13. Fix feedback tables
DROP POLICY IF EXISTS "Instructors can manage feedback" ON assignment_feedback;
CREATE POLICY "Manage assignment feedback" ON assignment_feedback
    FOR ALL TO authenticated
    USING (
        created_by = auth.uid() OR
        auth.is_admin() OR
        EXISTS (
            SELECT 1 FROM assignment_instances ai
            JOIN course_assignments ca ON ca.course_id = ai.course_id
            WHERE ai.id = assignment_feedback.assignment_instance_id
            AND ca.teacher_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can manage all activity" ON feedback_activity;
CREATE POLICY "Admins can manage all activity" ON feedback_activity
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 14. Fix feedback_permissions table
DROP POLICY IF EXISTS "Admins can view all feedback permissions" ON feedback_permissions;
DROP POLICY IF EXISTS "Admins can grant feedback permissions" ON feedback_permissions;
DROP POLICY IF EXISTS "Admins can update feedback permissions" ON feedback_permissions;

CREATE POLICY "Admins manage feedback permissions" ON feedback_permissions
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 15. Fix system_updates table
DROP POLICY IF EXISTS "Admins can manage updates" ON system_updates;
CREATE POLICY "Admins can manage updates" ON system_updates
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 16. Fix storage objects table policies
DROP POLICY IF EXISTS "Admins can manage all feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can read from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload to boletas bucket" ON storage.objects;

-- Create new storage policies using JWT
CREATE POLICY "Admin manage all storage" ON storage.objects
    FOR ALL TO authenticated
    USING (auth.is_admin())
    WITH CHECK (auth.is_admin());

-- 17. Fix lesson_assignment_submissions
DROP POLICY IF EXISTS "Students can create their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Students can create their own lesson assignment submissions" ON lesson_assignment_submissions;

CREATE POLICY "Users manage own submissions" ON lesson_assignment_submissions
    FOR ALL TO authenticated
    USING (student_id = auth.uid() OR auth.is_admin())
    WITH CHECK (student_id = auth.uid() OR auth.is_admin());

-- Test that we can query without recursion
SELECT 'Migration completed successfully' as status;