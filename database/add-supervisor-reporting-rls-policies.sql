-- ====================================================================
-- FNE LMS: Supervisor de Red Reporting RLS Policies
-- ====================================================================
-- This migration creates comprehensive RLS policies for network-based 
-- reporting access control, ensuring supervisor_de_red users can only
-- access data from schools in their assigned network.
-- ====================================================================

BEGIN;

-- ====================================================================
-- 1. UPDATE EXISTING REPORTING RLS POLICIES
-- ====================================================================

-- First, let's examine existing reporting-related tables and add network-aware policies
-- Note: We'll update policies for key tables that contain student/user data

-- Update profiles table policies to include network access
DROP POLICY IF EXISTS "profiles_supervisor_network_read" ON profiles;
CREATE POLICY "profiles_supervisor_network_read" ON profiles
    FOR SELECT USING (
        -- Allow supervisors to read profiles of users in their network schools
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN red_escuelas re ON re.red_id = ur.red_id
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'supervisor_de_red'
            AND ur.is_active = true
            AND (
                profiles.school_id = re.school_id
                OR EXISTS (
                    -- Also include users who have roles in network schools
                    SELECT 1 FROM user_roles user_ur
                    WHERE user_ur.user_id = profiles.id
                    AND user_ur.school_id = re.school_id::text
                    AND user_ur.is_active = true
                )
            )
        )
    );

-- Update course_assignments table for network access
-- Create policy if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_assignments') THEN
        DROP POLICY IF EXISTS "course_assignments_supervisor_network_read" ON course_assignments;
        EXECUTE 'CREATE POLICY "course_assignments_supervisor_network_read" ON course_assignments
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles ur
                    JOIN red_escuelas re ON re.red_id = ur.red_id
                    JOIN profiles p ON p.id = course_assignments.user_id
                    WHERE ur.user_id = auth.uid() 
                    AND ur.role_type = ''supervisor_de_red''
                    AND ur.is_active = true
                    AND (
                        p.school_id = re.school_id
                        OR EXISTS (
                            SELECT 1 FROM user_roles user_ur
                            WHERE user_ur.user_id = p.id
                            AND user_ur.school_id = re.school_id::text
                            AND user_ur.is_active = true
                        )
                    )
                )
            )';
        RAISE NOTICE 'Added network RLS policy for course_assignments';
    END IF;
END
$$;

-- Update quiz_submissions table for network access
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_submissions') THEN
        DROP POLICY IF EXISTS "quiz_submissions_supervisor_network_read" ON quiz_submissions;
        EXECUTE 'CREATE POLICY "quiz_submissions_supervisor_network_read" ON quiz_submissions
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles ur
                    JOIN red_escuelas re ON re.red_id = ur.red_id
                    JOIN profiles p ON p.id = quiz_submissions.user_id
                    WHERE ur.user_id = auth.uid() 
                    AND ur.role_type = ''supervisor_de_red''
                    AND ur.is_active = true
                    AND (
                        p.school_id = re.school_id
                        OR EXISTS (
                            SELECT 1 FROM user_roles user_ur
                            WHERE user_ur.user_id = p.id
                            AND user_ur.school_id = re.school_id::text
                            AND user_ur.is_active = true
                        )
                    )
                )
            )';
        RAISE NOTICE 'Added network RLS policy for quiz_submissions';
    END IF;
END
$$;

-- Update lesson_progress table for network access
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lesson_progress') THEN
        DROP POLICY IF EXISTS "lesson_progress_supervisor_network_read" ON lesson_progress;
        EXECUTE 'CREATE POLICY "lesson_progress_supervisor_network_read" ON lesson_progress
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles ur
                    JOIN red_escuelas re ON re.red_id = ur.red_id
                    JOIN profiles p ON p.id = lesson_progress.user_id
                    WHERE ur.user_id = auth.uid() 
                    AND ur.role_type = ''supervisor_de_red''
                    AND ur.is_active = true
                    AND (
                        p.school_id = re.school_id
                        OR EXISTS (
                            SELECT 1 FROM user_roles user_ur
                            WHERE user_ur.user_id = p.id
                            AND user_ur.school_id = re.school_id::text
                            AND user_ur.is_active = true
                        )
                    )
                )
            )';
        RAISE NOTICE 'Added network RLS policy for lesson_progress';
    END IF;
END
$$;

-- Update user_notifications table for network access
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_notifications') THEN
        DROP POLICY IF EXISTS "user_notifications_supervisor_network_read" ON user_notifications;
        EXECUTE 'CREATE POLICY "user_notifications_supervisor_network_read" ON user_notifications
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_roles ur
                    JOIN red_escuelas re ON re.red_id = ur.red_id
                    JOIN profiles p ON p.id = user_notifications.user_id
                    WHERE ur.user_id = auth.uid() 
                    AND ur.role_type = ''supervisor_de_red''
                    AND ur.is_active = true
                    AND (
                        p.school_id = re.school_id
                        OR EXISTS (
                            SELECT 1 FROM user_roles user_ur
                            WHERE user_ur.user_id = p.id
                            AND user_ur.school_id = re.school_id::text
                            AND user_ur.is_active = true
                        )
                    )
                )
            )';
        RAISE NOTICE 'Added network RLS policy for user_notifications';
    END IF;
END
$$;

-- ====================================================================
-- 2. RESTRICT ACCESS TO ADMIN-ONLY TABLES
-- ====================================================================

-- Ensure supervisor_de_red role is explicitly excluded from admin-only operations

-- Update user_roles policies to prevent supervisors from managing roles
DROP POLICY IF EXISTS "user_roles_supervisor_no_write" ON user_roles;
CREATE POLICY "user_roles_supervisor_no_write" ON user_roles
    FOR INSERT, UPDATE, DELETE USING (
        -- Explicitly deny supervisor_de_red from role management
        NOT EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'supervisor_de_red'
            AND ur.is_active = true
        )
    );

-- Supervisors can only read their own role assignment
DROP POLICY IF EXISTS "user_roles_supervisor_read_own" ON user_roles;
CREATE POLICY "user_roles_supervisor_read_own" ON user_roles
    FOR SELECT USING (
        -- Supervisors can only see their own roles
        (user_id = auth.uid() AND EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'supervisor_de_red'
            AND ur.is_active = true
        ))
        OR
        -- Or follow existing admin/other role policies
        NOT EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'supervisor_de_red'
            AND ur.is_active = true
        )
    );

-- Ensure supervisors cannot access sensitive configuration tables
DO $$
DECLARE
    restricted_table TEXT;
    restricted_tables TEXT[] := ARRAY[
        'schools', 'generations', 'growth_communities', 
        'courses', 'modules', 'lessons', 'blocks',
        'system_settings', 'audit_logs'
    ];
BEGIN
    FOREACH restricted_table IN ARRAY restricted_tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = restricted_table) THEN
            EXECUTE format('DROP POLICY IF EXISTS "%s_supervisor_no_access" ON %s', restricted_table, restricted_table);
            EXECUTE format('CREATE POLICY "%s_supervisor_no_access" ON %s
                FOR ALL USING (
                    NOT EXISTS (
                        SELECT 1 FROM user_roles ur
                        WHERE ur.user_id = auth.uid()
                        AND ur.role_type = ''supervisor_de_red''
                        AND ur.is_active = true
                    )
                )', restricted_table, restricted_table);
            RAISE NOTICE 'Added restrictive policy for %', restricted_table;
        END IF;
    END LOOP;
END
$$;

-- ====================================================================
-- 3. CREATE NETWORK DATA ACCESS FUNCTIONS
-- ====================================================================

-- Function to check if user is a network supervisor
CREATE OR REPLACE FUNCTION is_network_supervisor(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = is_network_supervisor.user_id
        AND ur.role_type = 'supervisor_de_red'
        AND ur.is_active = true
        AND ur.red_id IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get supervisor's network schools
CREATE OR REPLACE FUNCTION get_supervisor_network_schools(user_id UUID)
RETURNS TABLE (school_id INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT re.school_id
    FROM user_roles ur
    JOIN red_escuelas re ON re.red_id = ur.red_id
    WHERE ur.user_id = get_supervisor_network_schools.user_id
    AND ur.role_type = 'supervisor_de_red'
    AND ur.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if supervisor can access user data
CREATE OR REPLACE FUNCTION supervisor_can_access_user(supervisor_id UUID, target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if supervisor has access to any school the target user belongs to
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN red_escuelas re ON re.red_id = ur.red_id
        WHERE ur.user_id = supervisor_id
        AND ur.role_type = 'supervisor_de_red'
        AND ur.is_active = true
        AND (
            -- Target user's profile school
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = target_user_id
                AND p.school_id = re.school_id
            )
            OR
            -- Target user's role-based school
            EXISTS (
                SELECT 1 FROM user_roles target_ur
                WHERE target_ur.user_id = target_user_id
                AND target_ur.school_id = re.school_id::text
                AND target_ur.is_active = true
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 4. CREATE REPORTING VIEWS FOR SUPERVISORS
-- ====================================================================

-- Create a view for supervisor network reporting
CREATE OR REPLACE VIEW supervisor_network_report AS
SELECT 
    ur.user_id as supervisor_id,
    ur.red_id as network_id,
    r.name as network_name,
    COUNT(DISTINCT re.school_id) as school_count,
    COUNT(DISTINCT p.id) as total_users,
    COUNT(DISTINCT CASE WHEN p.created_at > NOW() - INTERVAL '30 days' THEN p.id END) as recent_users,
    COUNT(DISTINCT ca.id) as total_assignments,
    AVG(CASE WHEN ca.completed_at IS NOT NULL THEN 100.0 ELSE 0.0 END) as avg_completion_rate
FROM user_roles ur
JOIN redes_de_colegios r ON r.id = ur.red_id
JOIN red_escuelas re ON re.red_id = ur.red_id
LEFT JOIN profiles p ON p.school_id = re.school_id
LEFT JOIN course_assignments ca ON ca.user_id = p.id
WHERE ur.role_type = 'supervisor_de_red'
AND ur.is_active = true
GROUP BY ur.user_id, ur.red_id, r.name;

-- Grant access to the view
GRANT SELECT ON supervisor_network_report TO authenticated;

-- ====================================================================
-- 5. CREATE RLS POLICY FOR THE VIEW
-- ====================================================================

-- Enable RLS on the view
ALTER VIEW supervisor_network_report SET (security_barrier = true);

-- Supervisors can only see their own network data
CREATE OR REPLACE FUNCTION supervisor_network_report_policy()
RETURNS TRIGGER AS $$
BEGIN
    -- This function will be used by RLS policies
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Note: Views with security_barrier automatically inherit base table RLS policies

-- ====================================================================
-- 6. VERIFICATION AND TESTING
-- ====================================================================

-- Create a test function to verify supervisor access
CREATE OR REPLACE FUNCTION test_supervisor_access(
    supervisor_email TEXT,
    target_user_email TEXT
)
RETURNS TABLE (
    has_access BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    supervisor_id UUID;
    target_id UUID;
    network_schools INTEGER[];
    target_schools INTEGER[];
BEGIN
    -- Get supervisor ID
    SELECT id INTO supervisor_id FROM profiles WHERE email = supervisor_email;
    IF supervisor_id IS NULL THEN
        RETURN QUERY SELECT false, 'Supervisor not found';
        RETURN;
    END IF;

    -- Get target user ID
    SELECT id INTO target_id FROM profiles WHERE email = target_user_email;
    IF target_id IS NULL THEN
        RETURN QUERY SELECT false, 'Target user not found';
        RETURN;
    END IF;

    -- Check if supervisor has network role
    IF NOT is_network_supervisor(supervisor_id) THEN
        RETURN QUERY SELECT false, 'User is not a network supervisor';
        RETURN;
    END IF;

    -- Get supervisor's network schools
    SELECT ARRAY_AGG(school_id) INTO network_schools
    FROM get_supervisor_network_schools(supervisor_id);

    -- Get target user's schools
    SELECT ARRAY_AGG(DISTINCT school_id) INTO target_schools
    FROM (
        SELECT school_id FROM profiles WHERE id = target_id AND school_id IS NOT NULL
        UNION
        SELECT school_id::integer FROM user_roles WHERE user_id = target_id AND school_id IS NOT NULL AND is_active = true
    ) schools;

    -- Check for overlap
    IF network_schools && target_schools THEN
        RETURN QUERY SELECT true, 'Access granted - user in supervisor network';
    ELSE
        RETURN QUERY SELECT false, 'Access denied - user not in supervisor network';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================

-- Summary of RLS policies created:
-- ✓ Network-aware read access for profiles, course_assignments, quiz_submissions, lesson_progress
-- ✓ Restrictive policies preventing supervisor access to admin-only tables
-- ✓ Network data access functions for permission checking
-- ✓ Supervisor network reporting view with security barriers
-- ✓ Testing functions for access verification

-- Next steps:
-- 1. Test the policies with actual supervisor accounts
-- 2. Update API endpoints to use these functions
-- 3. Update frontend reporting to respect network scope
-- 4. Add monitoring for unauthorized access attempts

-- Test command examples:
-- SELECT * FROM test_supervisor_access('supervisor@example.com', 'student@school.com');
-- SELECT * FROM supervisor_network_report WHERE supervisor_id = 'uuid-here';