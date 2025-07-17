-- ====================================================================
-- FIX CONSULTANT ASSIGNMENTS RLS POLICIES
-- Updates all RLS policies to use user_roles instead of profiles.role
-- ====================================================================

-- Drop all existing policies on consultant_assignments
DROP POLICY IF EXISTS "admin_view_all_assignments" ON consultant_assignments;
DROP POLICY IF EXISTS "consultant_view_own_assignments" ON consultant_assignments;
DROP POLICY IF EXISTS "student_view_own_assignments" ON consultant_assignments;
DROP POLICY IF EXISTS "admin_create_assignments" ON consultant_assignments;
DROP POLICY IF EXISTS "admin_update_assignments" ON consultant_assignments;
DROP POLICY IF EXISTS "admin_delete_assignments" ON consultant_assignments;
DROP POLICY IF EXISTS "Admin can manage consultant_assignments" ON consultant_assignments;

-- Recreate policies with proper user_roles checks

-- Admins can view all assignments
CREATE POLICY "admin_view_all_assignments" ON consultant_assignments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
    );

-- Consultants can view their own assignments
CREATE POLICY "consultant_view_own_assignments" ON consultant_assignments
    FOR SELECT
    USING (consultant_id = auth.uid());

-- Students can view assignments where they are the student
CREATE POLICY "student_view_own_assignments" ON consultant_assignments
    FOR SELECT
    USING (student_id = auth.uid());

-- Only admins can create assignments
CREATE POLICY "admin_create_assignments" ON consultant_assignments
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
    );

-- Only admins can update assignments
CREATE POLICY "admin_update_assignments" ON consultant_assignments
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
    );

-- Only admins can delete assignments
CREATE POLICY "admin_delete_assignments" ON consultant_assignments
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
    );

-- Also fix the get_reportable_users function if it references profiles.role
CREATE OR REPLACE FUNCTION get_reportable_users(requesting_user_id UUID)
RETURNS TABLE (
    user_id UUID,
    first_name VARCHAR,
    last_name VARCHAR,
    email VARCHAR,
    role VARCHAR,
    school_id UUID,
    generation_id UUID,
    community_id UUID,
    assignment_type VARCHAR,
    can_view_progress BOOLEAN
) AS $$
BEGIN
    -- Return users that the requesting user can report on
    RETURN QUERY
    SELECT DISTINCT
        p.id as user_id,
        p.first_name,
        p.last_name,
        p.email,
        ur.role_type as role,  -- Changed from p.role to ur.role_type
        ca.school_id,
        ca.generation_id,
        ca.community_id,
        ca.assignment_type,
        ca.can_view_progress
    FROM consultant_assignments ca
    JOIN profiles p ON p.id = ca.student_id
    LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true  -- Added join to user_roles
    WHERE ca.consultant_id = requesting_user_id
        AND ca.is_active = true
        AND ca.can_view_progress = true
        AND (ca.ends_at IS NULL OR ca.ends_at > NOW())
    ORDER BY p.last_name, p.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_reportable_users(UUID) TO authenticated;

-- Verification query to check policies
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
WHERE tablename = 'consultant_assignments'
ORDER BY policyname;