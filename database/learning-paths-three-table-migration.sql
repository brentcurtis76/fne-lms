-- Learning Paths Feature - Three-Table Architecture Migration
-- This migration creates a robust, fail-safe learning paths system
-- Date: 2025-07-14
-- Author: Claude Code

-- =====================================================
-- 1. LEARNING PATHS - Path Metadata Table
-- =====================================================

CREATE TABLE learning_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add helpful constraints
ALTER TABLE learning_paths 
ADD CONSTRAINT learning_paths_name_not_empty 
CHECK (length(trim(name)) > 0);

-- Create index for performance
CREATE INDEX idx_learning_paths_created_by ON learning_paths(created_by);
CREATE INDEX idx_learning_paths_created_at ON learning_paths(created_at);

-- =====================================================
-- 2. LEARNING PATH COURSES - Path Content & Sequencing
-- =====================================================

CREATE TABLE learning_path_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure unique course per path (no duplicate courses in same path)
ALTER TABLE learning_path_courses 
ADD CONSTRAINT learning_path_courses_unique_course_per_path 
UNIQUE (path_id, course_id);

-- Ensure unique sequence per path (no duplicate ordering)
ALTER TABLE learning_path_courses 
ADD CONSTRAINT learning_path_courses_unique_sequence_per_path 
UNIQUE (path_id, sequence);

-- Ensure sequence is positive
ALTER TABLE learning_path_courses 
ADD CONSTRAINT learning_path_courses_sequence_positive 
CHECK (sequence > 0);

-- Create indexes for performance
CREATE INDEX idx_learning_path_courses_path_id ON learning_path_courses(path_id);
CREATE INDEX idx_learning_path_courses_course_id ON learning_path_courses(course_id);
CREATE INDEX idx_learning_path_courses_sequence ON learning_path_courses(path_id, sequence);

-- =====================================================
-- 3. LEARNING PATH ASSIGNMENTS - Atomic Assignment Table
-- =====================================================

CREATE TABLE learning_path_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure assignment is either to user OR group, not both
ALTER TABLE learning_path_assignments 
ADD CONSTRAINT learning_path_assignments_user_or_group_exclusive 
CHECK (
    (user_id IS NOT NULL AND group_id IS NULL) OR 
    (user_id IS NULL AND group_id IS NOT NULL)
);

-- Prevent duplicate assignments
ALTER TABLE learning_path_assignments 
ADD CONSTRAINT learning_path_assignments_unique_user_path 
UNIQUE (path_id, user_id);

ALTER TABLE learning_path_assignments 
ADD CONSTRAINT learning_path_assignments_unique_group_path 
UNIQUE (path_id, group_id);

-- Create indexes for performance
CREATE INDEX idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_assignments ENABLE ROW LEVEL SECURITY;

-- Learning Paths RLS Policies
CREATE POLICY "Users can view learning paths they created or are assigned to" 
ON learning_paths FOR SELECT 
USING (
    created_by = auth.uid() OR
    id IN (
        SELECT path_id FROM learning_path_assignments 
        WHERE user_id = auth.uid()
    ) OR
    id IN (
        SELECT lpa.path_id FROM learning_path_assignments lpa
        JOIN user_roles ur ON ur.user_id = auth.uid()
        WHERE lpa.group_id = ur.community_id
    )
);

CREATE POLICY "Admins and authorized users can create learning paths" 
ON learning_paths FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
        AND is_active = true
    )
);

CREATE POLICY "Users can update their own learning paths" 
ON learning_paths FOR UPDATE 
USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own learning paths" 
ON learning_paths FOR DELETE 
USING (created_by = auth.uid());

-- Learning Path Courses RLS Policies
CREATE POLICY "Users can view courses in paths they have access to" 
ON learning_path_courses FOR SELECT 
USING (
    path_id IN (
        SELECT id FROM learning_paths 
        WHERE created_by = auth.uid() OR
        id IN (
            SELECT path_id FROM learning_path_assignments 
            WHERE user_id = auth.uid()
        ) OR
        id IN (
            SELECT lpa.path_id FROM learning_path_assignments lpa
            JOIN user_roles ur ON ur.user_id = auth.uid()
            WHERE lpa.group_id = ur.community_id
        )
    )
);

CREATE POLICY "Path creators can manage courses in their paths" 
ON learning_path_courses FOR ALL 
USING (
    path_id IN (
        SELECT id FROM learning_paths 
        WHERE created_by = auth.uid()
    )
);

-- Learning Path Assignments RLS Policies
CREATE POLICY "Users can view assignments they created or are assigned to" 
ON learning_path_assignments FOR SELECT 
USING (
    assigned_by = auth.uid() OR
    user_id = auth.uid() OR
    group_id IN (
        SELECT community_id FROM user_roles 
        WHERE user_id = auth.uid() AND is_active = true
    )
);

CREATE POLICY "Authorized users can create assignments" 
ON learning_path_assignments FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
        AND is_active = true
    )
);

CREATE POLICY "Assignment creators can update their assignments" 
ON learning_path_assignments FOR UPDATE 
USING (assigned_by = auth.uid());

CREATE POLICY "Assignment creators can delete their assignments" 
ON learning_path_assignments FOR DELETE 
USING (assigned_by = auth.uid());

-- =====================================================
-- 5. USEFUL VIEWS FOR COMMON QUERIES
-- =====================================================

-- View: Complete Learning Paths with Course Details
CREATE VIEW learning_paths_with_courses AS
SELECT 
    lp.id,
    lp.name,
    lp.description,
    lp.created_by,
    lp.created_at,
    lp.updated_at,
    COALESCE(
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'course_id', c.id,
                'course_title', c.title,
                'course_description', c.description,
                'sequence', lpc.sequence
            ) ORDER BY lpc.sequence
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'::json
    ) AS courses
FROM learning_paths lp
LEFT JOIN learning_path_courses lpc ON lp.id = lpc.path_id
LEFT JOIN courses c ON lpc.course_id = c.id
GROUP BY lp.id, lp.name, lp.description, lp.created_by, lp.created_at, lp.updated_at;

-- View: Learning Path Assignments with User/Group Details
CREATE VIEW learning_path_assignments_with_details AS
SELECT 
    lpa.id,
    lpa.path_id,
    lp.name AS path_name,
    lpa.user_id,
    CASE 
        WHEN lpa.user_id IS NOT NULL THEN p.first_name || ' ' || p.last_name
        ELSE NULL
    END AS user_name,
    lpa.group_id,
    CASE 
        WHEN lpa.group_id IS NOT NULL THEN g.name
        ELSE NULL
    END AS group_name,
    lpa.assigned_by,
    assignee.first_name || ' ' || assignee.last_name AS assigned_by_name,
    lpa.assigned_at
FROM learning_path_assignments lpa
JOIN learning_paths lp ON lpa.path_id = lp.id
LEFT JOIN profiles p ON lpa.user_id = p.id
LEFT JOIN groups g ON lpa.group_id = g.id
JOIN profiles assignee ON lpa.assigned_by = assignee.id;

-- =====================================================
-- 6. UTILITY FUNCTIONS
-- =====================================================

-- Function: Get user's assigned learning paths
CREATE OR REPLACE FUNCTION get_user_learning_paths(target_user_id UUID)
RETURNS TABLE (
    path_id UUID,
    path_name TEXT,
    path_description TEXT,
    assigned_at TIMESTAMP WITH TIME ZONE,
    assignment_type TEXT
) 
LANGUAGE SQL
SECURITY DEFINER
AS $$
    -- Direct user assignments
    SELECT 
        lp.id,
        lp.name,
        lp.description,
        lpa.assigned_at,
        'direct'::TEXT
    FROM learning_paths lp
    JOIN learning_path_assignments lpa ON lp.id = lpa.path_id
    WHERE lpa.user_id = target_user_id
    
    UNION
    
    -- Group-based assignments
    SELECT 
        lp.id,
        lp.name,
        lp.description,
        lpa.assigned_at,
        'group'::TEXT
    FROM learning_paths lp
    JOIN learning_path_assignments lpa ON lp.id = lpa.path_id
    JOIN user_roles ur ON lpa.group_id = ur.community_id
    WHERE ur.user_id = target_user_id 
    AND ur.is_active = true
    
    ORDER BY assigned_at DESC;
$$;

-- Function: Check if user can access a learning path
CREATE OR REPLACE FUNCTION user_can_access_learning_path(
    target_user_id UUID, 
    target_path_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        -- Path creator
        SELECT 1 FROM learning_paths 
        WHERE id = target_path_id AND created_by = target_user_id
        
        UNION
        
        -- Direct assignment
        SELECT 1 FROM learning_path_assignments
        WHERE path_id = target_path_id AND user_id = target_user_id
        
        UNION
        
        -- Group assignment
        SELECT 1 FROM learning_path_assignments lpa
        JOIN user_roles ur ON lpa.group_id = ur.community_id
        WHERE lpa.path_id = target_path_id 
        AND ur.user_id = target_user_id 
        AND ur.is_active = true
    );
$$;

-- =====================================================
-- 7. AUDIT LOG TABLE (Optional but recommended)
-- =====================================================

CREATE TABLE learning_path_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_learning_path_audit_log_record_id ON learning_path_audit_log(record_id);
CREATE INDEX idx_learning_path_audit_log_changed_at ON learning_path_audit_log(changed_at);

-- =====================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE learning_paths IS 'Stores learning path metadata and ownership information';
COMMENT ON TABLE learning_path_courses IS 'Defines the courses included in each learning path and their sequence order';
COMMENT ON TABLE learning_path_assignments IS 'Atomic assignment tracking - links paths to users or groups';

COMMENT ON COLUMN learning_paths.created_by IS 'User who created this learning path - typically admin, equipo_directivo, or consultor';
COMMENT ON COLUMN learning_path_courses.sequence IS 'Order of courses in the path (1-based, must be positive and unique per path)';
COMMENT ON COLUMN learning_path_assignments.user_id IS 'Individual user assignment (mutually exclusive with group_id)';
COMMENT ON COLUMN learning_path_assignments.group_id IS 'Group assignment (mutually exclusive with user_id)';
COMMENT ON COLUMN learning_path_assignments.assigned_by IS 'User who made this assignment';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify the migration
DO $$
BEGIN
    -- Check that all tables were created
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_paths') THEN
        RAISE EXCEPTION 'Migration failed: learning_paths table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_path_courses') THEN
        RAISE EXCEPTION 'Migration failed: learning_path_courses table not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_path_assignments') THEN
        RAISE EXCEPTION 'Migration failed: learning_path_assignments table not created';
    END IF;
    
    RAISE NOTICE '✅ Learning Paths three-table migration completed successfully';
    RAISE NOTICE 'Tables created: learning_paths, learning_path_courses, learning_path_assignments';
    RAISE NOTICE 'Features: RLS policies, indexes, constraints, views, utility functions';
END $$;