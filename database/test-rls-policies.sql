-- FNE LMS Test Database RLS Policies and Functions
-- This file contains the essential RLS policies for testing

-- Function to check if user has admin role
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = user_uuid AND role_type = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has any role in a school
CREATE OR REPLACE FUNCTION has_role_in_school(user_uuid UUID, school_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = user_uuid AND school_id = school_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's primary role
CREATE OR REPLACE FUNCTION get_user_primary_role(user_uuid UUID)
RETURNS role_type AS $$
DECLARE
    primary_role role_type;
BEGIN
    SELECT role_type INTO primary_role
    FROM user_roles
    WHERE user_id = user_uuid
    ORDER BY 
        CASE role_type
            WHEN 'admin' THEN 1
            WHEN 'consultor' THEN 2
            WHEN 'equipo_directivo' THEN 3
            WHEN 'lider_generacion' THEN 4
            WHEN 'lider_comunidad' THEN 5
            WHEN 'supervisor_de_red' THEN 6
            WHEN 'docente' THEN 7
            WHEN 'inspirador' THEN 8
            WHEN 'socio_comunitario' THEN 9
        END
    LIMIT 1;
    
    RETURN primary_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comprehensive RLS Policies

-- Schools policies
DROP POLICY IF EXISTS "authenticated_users_read_schools" ON schools;
CREATE POLICY "authenticated_users_read_schools" ON schools
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admins_manage_schools" ON schools;
CREATE POLICY "admins_manage_schools" ON schools
    FOR ALL USING (is_admin(auth.uid()));

-- Profiles policies
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles" ON profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "admins_manage_profiles" ON profiles;
CREATE POLICY "admins_manage_profiles" ON profiles
    FOR ALL USING (is_admin(auth.uid()));

-- User roles policies
DROP POLICY IF EXISTS "Users can view own roles" ON user_roles;
CREATE POLICY "Users can view own roles" ON user_roles
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins can manage all roles" ON user_roles
    FOR ALL USING (is_admin(auth.uid()));

-- Generations policies
CREATE POLICY "users_view_generations" ON generations
    FOR SELECT USING (
        auth.role() = 'authenticated' AND (
            is_admin(auth.uid()) OR
            EXISTS (
                SELECT 1 FROM user_roles
                WHERE user_id = auth.uid() AND school_id = generations.school_id
            )
        )
    );

CREATE POLICY "admins_manage_generations" ON generations
    FOR ALL USING (is_admin(auth.uid()));

-- Communities policies
CREATE POLICY "users_view_communities" ON communities
    FOR SELECT USING (
        is_admin(auth.uid()) OR
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM community_members
            WHERE community_id = communities.id AND user_id = auth.uid()
        )
    );

CREATE POLICY "users_create_communities" ON communities
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "community_creators_update" ON communities
    FOR UPDATE USING (created_by = auth.uid() OR is_admin(auth.uid()));

-- Community members policies
CREATE POLICY "members_view_community_members" ON community_members
    FOR SELECT USING (
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.community_id = community_members.community_id 
            AND cm.user_id = auth.uid()
        )
    );

CREATE POLICY "users_join_communities" ON community_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Courses policies
DROP POLICY IF EXISTS "Anyone can view published courses" ON courses;
CREATE POLICY "Anyone can view published courses" ON courses
    FOR SELECT USING (
        is_published = true OR 
        created_by = auth.uid() OR
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM course_enrollments
            WHERE course_id = courses.id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Creators can update own courses" ON courses;
CREATE POLICY "Creators can update own courses" ON courses
    FOR UPDATE USING (created_by = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "authorized_users_create_courses" ON courses
    FOR INSERT WITH CHECK (
        auth.uid() = created_by AND (
            is_admin(auth.uid()) OR
            get_user_primary_role(auth.uid()) IN ('consultor', 'equipo_directivo')
        )
    );

-- Course enrollments policies
DROP POLICY IF EXISTS "Users can view own enrollments" ON course_enrollments;
CREATE POLICY "Users can view own enrollments" ON course_enrollments
    FOR SELECT USING (
        user_id = auth.uid() OR 
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM courses
            WHERE id = course_enrollments.course_id AND created_by = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can enroll themselves" ON course_enrollments;
CREATE POLICY "Users can enroll themselves" ON course_enrollments
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Lessons policies
CREATE POLICY "users_view_enrolled_lessons" ON lessons
    FOR SELECT USING (
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM courses
            WHERE id = lessons.course_id AND created_by = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM course_enrollments
            WHERE course_id = lessons.course_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "course_creators_manage_lessons" ON lessons
    FOR ALL USING (
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM courses
            WHERE id = lessons.course_id AND created_by = auth.uid()
        )
    );

-- Blocks policies
CREATE POLICY "users_view_course_blocks" ON blocks
    FOR SELECT USING (
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM courses
            WHERE id = blocks.course_id AND created_by = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM course_enrollments
            WHERE course_id = blocks.course_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "course_creators_manage_blocks" ON blocks
    FOR ALL USING (
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM courses
            WHERE id = blocks.course_id AND created_by = auth.uid()
        )
    );

-- User notifications policies
CREATE POLICY "users_view_own_notifications" ON user_notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_update_own_notifications" ON user_notifications
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "system_create_notifications" ON user_notifications
    FOR INSERT WITH CHECK (true);

-- Posts policies (Instagram-like feed)
CREATE POLICY "users_view_community_posts" ON posts
    FOR SELECT USING (
        visibility = 'public' OR
        user_id = auth.uid() OR
        is_admin(auth.uid()) OR
        (visibility = 'community' AND EXISTS (
            SELECT 1 FROM community_members
            WHERE community_id = posts.community_id AND user_id = auth.uid()
        ))
    );

CREATE POLICY "users_create_posts" ON posts
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND (
            community_id IS NULL OR
            EXISTS (
                SELECT 1 FROM community_members
                WHERE community_id = posts.community_id AND user_id = auth.uid()
            )
        )
    );

CREATE POLICY "users_update_own_posts" ON posts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_posts" ON posts
    FOR DELETE USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- Post media policies
CREATE POLICY "users_view_post_media" ON post_media
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE id = post_media.post_id AND (
                visibility = 'public' OR
                user_id = auth.uid() OR
                is_admin(auth.uid()) OR
                (visibility = 'community' AND EXISTS (
                    SELECT 1 FROM community_members
                    WHERE community_id = posts.community_id AND user_id = auth.uid()
                ))
            )
        )
    );

CREATE POLICY "post_owners_manage_media" ON post_media
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE id = post_media.post_id AND user_id = auth.uid()
        )
    );

-- Assignment submissions policies
CREATE POLICY "users_view_own_submissions" ON assignment_submissions
    FOR SELECT USING (
        user_id = auth.uid() OR
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM assignments a
            JOIN courses c ON a.course_id = c.id
            WHERE a.id = assignment_submissions.assignment_id 
            AND c.created_by = auth.uid()
        )
    );

CREATE POLICY "users_create_own_submissions" ON assignment_submissions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_submissions" ON assignment_submissions
    FOR UPDATE USING (
        user_id = auth.uid() AND submitted_at IS NULL
    );

-- Quiz submissions policies
CREATE POLICY "users_view_own_quiz_submissions" ON quiz_submissions
    FOR SELECT USING (
        user_id = auth.uid() OR
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM quizzes q
            JOIN courses c ON q.course_id = c.id
            WHERE q.id = quiz_submissions.quiz_id 
            AND c.created_by = auth.uid()
        )
    );

CREATE POLICY "users_create_quiz_submissions" ON quiz_submissions
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Expense reports policies
CREATE POLICY "users_view_own_expense_reports" ON expense_reports
    FOR SELECT USING (
        user_id = auth.uid() OR
        is_admin(auth.uid()) OR
        (get_user_primary_role(auth.uid()) = 'equipo_directivo' AND 
         has_role_in_school(auth.uid(), school_id))
    );

CREATE POLICY "users_create_expense_reports" ON expense_reports
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_pending_reports" ON expense_reports
    FOR UPDATE USING (
        user_id = auth.uid() AND status = 'pending'
    );

-- Network supervisor policies
CREATE POLICY "supervisors_view_own_networks" ON redes_de_colegios
    FOR SELECT USING (
        is_admin(auth.uid()) OR
        supervisor_id = auth.uid()
    );

CREATE POLICY "admins_manage_networks" ON redes_de_colegios
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "network_members_view_schools" ON red_escuelas
    FOR SELECT USING (
        is_admin(auth.uid()) OR
        EXISTS (
            SELECT 1 FROM redes_de_colegios
            WHERE id = red_escuelas.red_id AND supervisor_id = auth.uid()
        )
    );

-- Audit logs policies
CREATE POLICY "admins_view_audit_logs" ON audit_logs
    FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "system_create_audit_logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_role_in_school(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_primary_role(UUID) TO authenticated;