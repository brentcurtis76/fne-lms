-- ====================================================================
-- UPDATE CONSULTANT ASSIGNMENTS FOR GROUP SUPPORT
-- Allows consultants to be assigned to entire schools, generations, or communities
-- ====================================================================

-- 1. Make student_id nullable for group assignments
ALTER TABLE consultant_assignments 
ALTER COLUMN student_id DROP NOT NULL;

-- 2. Update assignment_type to include 'comprehensive' (all permissions)
ALTER TABLE consultant_assignments 
DROP CONSTRAINT IF EXISTS consultant_assignments_assignment_type_check;

ALTER TABLE consultant_assignments 
ADD CONSTRAINT consultant_assignments_assignment_type_check 
CHECK (assignment_type IN ('monitoring', 'mentoring', 'evaluation', 'support', 'comprehensive'));

-- 3. Drop the old unique constraint and create a new one that handles both individual and group assignments
ALTER TABLE consultant_assignments 
DROP CONSTRAINT IF EXISTS consultant_student_unique;

-- For individual assignments: unique on consultant_id + student_id + is_active
-- For group assignments: unique on consultant_id + school_id + generation_id + community_id + is_active
CREATE UNIQUE INDEX consultant_individual_assignment_unique 
ON consultant_assignments(consultant_id, student_id, is_active) 
WHERE student_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX consultant_school_assignment_unique 
ON consultant_assignments(consultant_id, school_id, is_active) 
WHERE student_id IS NULL AND generation_id IS NULL AND community_id IS NULL AND school_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX consultant_generation_assignment_unique 
ON consultant_assignments(consultant_id, school_id, generation_id, is_active) 
WHERE student_id IS NULL AND community_id IS NULL AND school_id IS NOT NULL AND generation_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX consultant_community_assignment_unique 
ON consultant_assignments(consultant_id, school_id, generation_id, community_id, is_active) 
WHERE student_id IS NULL AND school_id IS NOT NULL AND generation_id IS NOT NULL AND community_id IS NOT NULL AND is_active = true;

-- 4. Update the self-assignment check to only apply to individual assignments
ALTER TABLE consultant_assignments 
DROP CONSTRAINT IF EXISTS consultant_not_self;

ALTER TABLE consultant_assignments 
ADD CONSTRAINT consultant_not_self 
CHECK (student_id IS NULL OR consultant_id != student_id);

-- 5. Create an enhanced helper function that handles both individual and group assignments
CREATE OR REPLACE FUNCTION get_reportable_users_enhanced(requesting_user_id UUID)
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
    can_view_progress BOOLEAN,
    assignment_scope TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH direct_assignments AS (
        -- Individual assignments
        SELECT 
            p.id as user_id,
            p.first_name,
            p.last_name,
            p.email,
            p.role,
            ca.school_id,
            ca.generation_id,
            ca.community_id,
            ca.assignment_type,
            ca.can_view_progress,
            'individual'::TEXT as assignment_scope
        FROM consultant_assignments ca
        JOIN profiles p ON p.id = ca.student_id
        WHERE ca.consultant_id = requesting_user_id
            AND ca.is_active = true
            AND ca.can_view_progress = true
            AND (ca.ends_at IS NULL OR ca.ends_at > NOW())
            AND ca.student_id IS NOT NULL
    ),
    group_assignments AS (
        -- Group assignments (school, generation, or community level)
        SELECT 
            p.id as user_id,
            p.first_name,
            p.last_name,
            p.email,
            p.role,
            ca.school_id,
            ca.generation_id,
            ca.community_id,
            ca.assignment_type,
            ca.can_view_progress,
            CASE 
                WHEN ca.community_id IS NOT NULL THEN 'community'
                WHEN ca.generation_id IS NOT NULL THEN 'generation'
                WHEN ca.school_id IS NOT NULL THEN 'school'
            END::TEXT as assignment_scope
        FROM consultant_assignments ca
        JOIN profiles p ON 
            (ca.community_id IS NOT NULL AND p.community_id = ca.community_id) OR
            (ca.community_id IS NULL AND ca.generation_id IS NOT NULL AND p.generation_id = ca.generation_id) OR
            (ca.community_id IS NULL AND ca.generation_id IS NULL AND ca.school_id IS NOT NULL AND p.school_id = ca.school_id)
        WHERE ca.consultant_id = requesting_user_id
            AND ca.is_active = true
            AND ca.can_view_progress = true
            AND (ca.ends_at IS NULL OR ca.ends_at > NOW())
            AND ca.student_id IS NULL
    )
    SELECT DISTINCT * FROM (
        SELECT * FROM direct_assignments
        UNION ALL
        SELECT * FROM group_assignments
    ) combined_assignments
    ORDER BY last_name, first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the new function
GRANT EXECUTE ON FUNCTION get_reportable_users_enhanced(UUID) TO authenticated;

-- Add index for group assignment queries
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_generation_id ON profiles(generation_id) WHERE generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_community_id ON profiles(community_id) WHERE community_id IS NOT NULL;

-- Update column comments
COMMENT ON COLUMN consultant_assignments.student_id IS 'Individual user ID for direct assignments (NULL for group assignments)';
COMMENT ON COLUMN consultant_assignments.assignment_type IS 'Type of assignment: monitoring, mentoring, evaluation, support, or comprehensive';
COMMENT ON FUNCTION get_reportable_users_enhanced IS 'Returns all users a consultant can report on, including both individual and group assignments';