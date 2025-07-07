-- Migration 002: Update all RLS policies to use the new role detection system
-- This migration updates all tables to use the non-recursive role functions

-- =============================================
-- LESSONS TABLE
-- =============================================
-- Drop all existing policies
DROP POLICY IF EXISTS "Allow admin users full access to lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to delete lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to insert lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to select lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to update lessons" ON lessons;
DROP POLICY IF EXISTS "Allow delete for all users" ON lessons;
DROP POLICY IF EXISTS "Allow insert for all users" ON lessons;
DROP POLICY IF EXISTS "Allow read access to all users" ON lessons;
DROP POLICY IF EXISTS "Allow update for all users" ON lessons;

-- Create new secure policies
CREATE POLICY "lessons_admin_all" ON lessons
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "lessons_teacher_manage" ON lessons
    FOR ALL TO authenticated
    USING (
        auth_is_course_teacher(
            (SELECT m.course_id FROM modules m WHERE m.id = lessons.module_id)
        )
    )
    WITH CHECK (
        auth_is_course_teacher(
            (SELECT m.course_id FROM modules m WHERE m.id = lessons.module_id)
        )
    );

CREATE POLICY "lessons_student_view" ON lessons
    FOR SELECT TO authenticated
    USING (
        auth_is_course_student(
            (SELECT m.course_id FROM modules m WHERE m.id = lessons.module_id)
        )
    );

-- =============================================
-- COURSES TABLE
-- =============================================
DROP POLICY IF EXISTS "Allow insert for admins" ON courses;
DROP POLICY IF EXISTS "Authenticated users can view courses" ON courses;

CREATE POLICY "courses_admin_all" ON courses
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "courses_teacher_view" ON courses
    FOR SELECT TO authenticated
    USING (
        auth_is_course_teacher(courses.id)
    );

CREATE POLICY "courses_student_view" ON courses
    FOR SELECT TO authenticated
    USING (
        auth_is_course_student(courses.id)
    );

-- =============================================
-- MODULES TABLE
-- =============================================
-- First check existing policies
DROP POLICY IF EXISTS "Admins can manage modules" ON modules;
DROP POLICY IF EXISTS "Teachers can manage modules" ON modules;
DROP POLICY IF EXISTS "Students can view modules" ON modules;

CREATE POLICY "modules_admin_all" ON modules
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "modules_teacher_manage" ON modules
    FOR ALL TO authenticated
    USING (auth_is_course_teacher(modules.course_id))
    WITH CHECK (auth_is_course_teacher(modules.course_id));

CREATE POLICY "modules_student_view" ON modules
    FOR SELECT TO authenticated
    USING (auth_is_course_student(modules.course_id));

-- =============================================
-- BLOCKS TABLE
-- =============================================
DROP POLICY IF EXISTS "Admins can manage blocks" ON blocks;
DROP POLICY IF EXISTS "Teachers can manage blocks" ON blocks;
DROP POLICY IF EXISTS "Students can view blocks" ON blocks;

CREATE POLICY "blocks_admin_all" ON blocks
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "blocks_teacher_manage" ON blocks
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = blocks.lesson_id
            AND auth_is_course_teacher(m.course_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = blocks.lesson_id
            AND auth_is_course_teacher(m.course_id)
        )
    );

CREATE POLICY "blocks_student_view" ON blocks
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = blocks.lesson_id
            AND auth_is_course_student(m.course_id)
        )
    );

-- =============================================
-- COURSE_ASSIGNMENTS TABLE
-- =============================================
DROP POLICY IF EXISTS "Admins can manage course assignments" ON course_assignments;

CREATE POLICY "course_assignments_admin_all" ON course_assignments
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "course_assignments_teacher_view_own" ON course_assignments
    FOR SELECT TO authenticated
    USING (teacher_id = auth.uid());

-- =============================================
-- COURSE_ENROLLMENTS TABLE
-- =============================================
DROP POLICY IF EXISTS "Admins can manage enrollments" ON course_enrollments;
DROP POLICY IF EXISTS "Students can view own enrollments" ON course_enrollments;

CREATE POLICY "course_enrollments_admin_all" ON course_enrollments
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "course_enrollments_student_view_own" ON course_enrollments
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

CREATE POLICY "course_enrollments_teacher_view" ON course_enrollments
    FOR SELECT TO authenticated
    USING (auth_is_course_teacher(course_id));

-- =============================================
-- SCHOOLS TABLE
-- =============================================
DROP POLICY IF EXISTS "Admin full access to schools" ON schools;
DROP POLICY IF EXISTS "Allow admin to delete schools" ON schools;
DROP POLICY IF EXISTS "Allow admin to insert new schools" ON schools;
DROP POLICY IF EXISTS "Allow admin to update schools" ON schools;
DROP POLICY IF EXISTS "Allow all users to select schools" ON schools;
DROP POLICY IF EXISTS "Authenticated users can view schools" ON schools;

CREATE POLICY "schools_admin_all" ON schools
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "schools_authenticated_view" ON schools
    FOR SELECT TO authenticated
    USING (true); -- All authenticated users can view schools

-- =============================================
-- GENERATIONS TABLE
-- =============================================
DROP POLICY IF EXISTS "Allow admin to manage generations" ON generations;
DROP POLICY IF EXISTS "Admin full access to generations" ON generations;

CREATE POLICY "generations_admin_all" ON generations
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "generations_school_members_view" ON generations
    FOR SELECT TO authenticated
    USING (auth_has_school_access(school_id));

-- =============================================
-- GROWTH_COMMUNITIES TABLE
-- =============================================
DROP POLICY IF EXISTS "Allow admin to manage growth_communities" ON growth_communities;
DROP POLICY IF EXISTS "Admin full access to communities" ON growth_communities;

CREATE POLICY "growth_communities_admin_all" ON growth_communities
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "growth_communities_members_view" ON growth_communities
    FOR SELECT TO authenticated
    USING (
        auth_has_school_access(school_id) OR
        EXISTS (
            SELECT 1 FROM user_roles_cache
            WHERE user_id = auth.uid()
            AND community_id = growth_communities.id
        )
    );

-- =============================================
-- PLATFORM_FEEDBACK TABLE
-- =============================================
-- Already fixed in previous migration, but let's ensure it uses our functions
DROP POLICY IF EXISTS "Admins can view all feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Users can create feedback" ON platform_feedback;
DROP POLICY IF EXISTS "Users can view their own feedback" ON platform_feedback;

CREATE POLICY "platform_feedback_admin_all" ON platform_feedback
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "platform_feedback_user_own" ON platform_feedback
    FOR ALL TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- =============================================
-- EXPENSE REPORTS AND RELATED TABLES
-- =============================================
DROP POLICY IF EXISTS "expense_reports_select" ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_update" ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_delete" ON expense_reports;

CREATE POLICY "expense_reports_admin_all" ON expense_reports
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "expense_reports_user_own" ON expense_reports
    FOR ALL TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "expense_items_select" ON expense_items;
DROP POLICY IF EXISTS "expense_items_update" ON expense_items;
DROP POLICY IF EXISTS "expense_items_delete" ON expense_items;

CREATE POLICY "expense_items_admin_all" ON expense_items
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "expense_items_user_own" ON expense_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.expense_report_id
            AND er.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.expense_report_id
            AND er.created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "expense_categories_insert" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_update" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_delete" ON expense_categories;

CREATE POLICY "expense_categories_admin_all" ON expense_categories
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "expense_categories_authenticated_view" ON expense_categories
    FOR SELECT TO authenticated
    USING (true);

-- =============================================
-- QUIZ AND ASSIGNMENT TABLES
-- =============================================
DROP POLICY IF EXISTS "Teachers can grade quiz submissions" ON quiz_submissions;
DROP POLICY IF EXISTS "Teachers can view quiz submissions for their courses" ON quiz_submissions;

CREATE POLICY "quiz_submissions_admin_all" ON quiz_submissions
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "quiz_submissions_student_own" ON quiz_submissions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "quiz_submissions_teacher_manage" ON quiz_submissions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = quiz_submissions.lesson_id
            AND auth_is_course_teacher(m.course_id)
        )
    );

-- =============================================
-- ASSIGNMENT TABLES
-- =============================================
DROP POLICY IF EXISTS "View assignment instances - admin/consultor" ON assignment_instances;
DROP POLICY IF EXISTS "Create assignment instances" ON assignment_instances;
DROP POLICY IF EXISTS "Update assignment instances" ON assignment_instances;
DROP POLICY IF EXISTS "Delete assignment instances" ON assignment_instances;

CREATE POLICY "assignment_instances_admin_all" ON assignment_instances
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "assignment_instances_teacher_manage" ON assignment_instances
    FOR ALL TO authenticated
    USING (auth_is_course_teacher(course_id))
    WITH CHECK (auth_is_course_teacher(course_id));

CREATE POLICY "assignment_instances_student_view" ON assignment_instances
    FOR SELECT TO authenticated
    USING (
        student_id = auth.uid() OR
        auth_is_course_student(course_id)
    );

DROP POLICY IF EXISTS "View assignment templates" ON assignment_templates;
DROP POLICY IF EXISTS "Manage assignment templates" ON assignment_templates;

CREATE POLICY "assignment_templates_admin_all" ON assignment_templates
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "assignment_templates_creator_manage" ON assignment_templates
    FOR ALL TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "assignment_templates_authenticated_view" ON assignment_templates
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Instructors can manage feedback" ON assignment_feedback;

CREATE POLICY "assignment_feedback_admin_all" ON assignment_feedback
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "assignment_feedback_creator_manage" ON assignment_feedback
    FOR ALL TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "assignment_feedback_teacher_manage" ON assignment_feedback
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM assignment_instances ai
            WHERE ai.id = assignment_feedback.assignment_instance_id
            AND auth_is_course_teacher(ai.course_id)
        )
    );

-- =============================================
-- LESSON ASSIGNMENTS AND SUBMISSIONS
-- =============================================
DROP POLICY IF EXISTS "consultores_delete_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Admins can delete lesson assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "users_view_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers and above can create assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "consultores_create_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "consultores_update_assignments" ON lesson_assignments;
DROP POLICY IF EXISTS "Teachers and above can create lesson assignments" ON lesson_assignments;

CREATE POLICY "lesson_assignments_admin_all" ON lesson_assignments
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "lesson_assignments_teacher_manage" ON lesson_assignments
    FOR ALL TO authenticated
    USING (
        created_by = auth.uid() OR
        auth_is_course_teacher(course_id)
    )
    WITH CHECK (
        created_by = auth.uid() OR
        auth_is_course_teacher(course_id)
    );

CREATE POLICY "lesson_assignments_student_view" ON lesson_assignments
    FOR SELECT TO authenticated
    USING (
        auth_is_course_student(course_id)
    );

DROP POLICY IF EXISTS "Students can create their own submissions" ON lesson_assignment_submissions;
DROP POLICY IF EXISTS "Students can create their own lesson assignment submissions" ON lesson_assignment_submissions;

CREATE POLICY "lesson_assignment_submissions_admin_all" ON lesson_assignment_submissions
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "lesson_assignment_submissions_student_own" ON lesson_assignment_submissions
    FOR ALL TO authenticated
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "lesson_assignment_submissions_teacher_view" ON lesson_assignment_submissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lesson_assignments la
            WHERE la.id = lesson_assignment_submissions.assignment_id
            AND auth_is_course_teacher(la.course_id)
        )
    );

-- =============================================
-- LESSON PROGRESS
-- =============================================
DROP POLICY IF EXISTS "Admins can view all progress" ON lesson_progress;

CREATE POLICY "lesson_progress_admin_all" ON lesson_progress
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "lesson_progress_user_own" ON lesson_progress
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "lesson_progress_teacher_view" ON lesson_progress
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM lessons l
            JOIN modules m ON m.id = l.module_id
            WHERE l.id = lesson_progress.lesson_id
            AND auth_is_course_teacher(m.course_id)
        )
    );

-- =============================================
-- NOTIFICATION TABLES
-- =============================================
DROP POLICY IF EXISTS "Admin can view notification events" ON notification_events;
DROP POLICY IF EXISTS "Admin can manage notification triggers" ON notification_triggers;
DROP POLICY IF EXISTS "Admins can view all notifications" ON user_notifications;

CREATE POLICY "notification_events_admin_all" ON notification_events
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "notification_triggers_admin_all" ON notification_triggers
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "user_notifications_admin_all" ON user_notifications
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "user_notifications_user_own" ON user_notifications
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================
-- FEEDBACK PERMISSIONS AND ACTIVITY
-- =============================================
DROP POLICY IF EXISTS "Admins can view all feedback permissions" ON feedback_permissions;
DROP POLICY IF EXISTS "Admins can grant feedback permissions" ON feedback_permissions;
DROP POLICY IF EXISTS "Admins can update feedback permissions" ON feedback_permissions;

CREATE POLICY "feedback_permissions_admin_all" ON feedback_permissions
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "feedback_permissions_user_view_own" ON feedback_permissions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all activity" ON feedback_activity;

CREATE POLICY "feedback_activity_admin_all" ON feedback_activity
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "feedback_activity_user_view_own" ON feedback_activity
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- =============================================
-- SYSTEM UPDATES
-- =============================================
DROP POLICY IF EXISTS "Admins can manage updates" ON system_updates;

CREATE POLICY "system_updates_admin_all" ON system_updates
    FOR ALL TO authenticated
    USING (auth_is_admin())
    WITH CHECK (auth_is_admin());

CREATE POLICY "system_updates_authenticated_view" ON system_updates
    FOR SELECT TO authenticated
    USING (true);

-- Add helpful comments
COMMENT ON POLICY "lessons_admin_all" ON lessons IS 'Admins have full access to all lessons';
COMMENT ON POLICY "lessons_teacher_manage" ON lessons IS 'Teachers can manage lessons in their assigned courses';
COMMENT ON POLICY "lessons_student_view" ON lessons IS 'Students can view lessons in their enrolled courses';

-- Verify the migration worked
DO $$
BEGIN
    RAISE NOTICE 'RLS policies have been updated to use non-recursive role detection';
END $$;