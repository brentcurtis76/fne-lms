-- Learning Paths Migration - Compatible with Existing FNE LMS System
-- This migration adds missing components while preserving existing data
-- Date: 2025-07-14
-- Author: Claude Code

-- =====================================================
-- 1. ANALYZE EXISTING STRUCTURE
-- =====================================================

-- The existing learning_paths table has:
-- id, name, description, school_id, generation_id, is_active, path_data, created_by, created_at, updated_at

-- =====================================================
-- 2. FIX LEARNING_PATH_COURSES TABLE STRUCTURE
-- =====================================================

-- First, check if learning_path_courses has the right structure
DO $$
BEGIN
    -- Check if path_id column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'learning_path_courses' 
        AND column_name = 'path_id'
    ) THEN
        -- Add missing columns to existing table
        ALTER TABLE learning_path_courses 
        ADD COLUMN IF NOT EXISTS path_id UUID REFERENCES learning_paths(id) ON DELETE CASCADE;
        
        ALTER TABLE learning_path_courses 
        ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
        
        ALTER TABLE learning_path_courses 
        ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 1;
        
        RAISE NOTICE 'Added missing columns to learning_path_courses table';
    ELSE
        RAISE NOTICE 'learning_path_courses table already has correct structure';
    END IF;
END $$;

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Unique course per path constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'learning_path_courses' 
        AND constraint_name = 'learning_path_courses_unique_course_per_path'
    ) THEN
        ALTER TABLE learning_path_courses 
        ADD CONSTRAINT learning_path_courses_unique_course_per_path 
        UNIQUE (path_id, course_id);
        
        RAISE NOTICE 'Added unique course per path constraint';
    END IF;

    -- Unique sequence per path constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'learning_path_courses' 
        AND constraint_name = 'learning_path_courses_unique_sequence_per_path'
    ) THEN
        ALTER TABLE learning_path_courses 
        ADD CONSTRAINT learning_path_courses_unique_sequence_per_path 
        UNIQUE (path_id, sequence);
        
        RAISE NOTICE 'Added unique sequence per path constraint';
    END IF;

    -- Positive sequence constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'learning_path_courses' 
        AND constraint_name = 'learning_path_courses_sequence_positive'
    ) THEN
        ALTER TABLE learning_path_courses 
        ADD CONSTRAINT learning_path_courses_sequence_positive 
        CHECK (sequence > 0);
        
        RAISE NOTICE 'Added positive sequence constraint';
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_path_id ON learning_path_courses(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_course_id ON learning_path_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_sequence ON learning_path_courses(path_id, sequence);

-- =====================================================
-- 3. CREATE LEARNING_PATH_ASSIGNMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS learning_path_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints
DO $$
BEGIN
    -- User or group exclusive constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'learning_path_assignments' 
        AND constraint_name = 'learning_path_assignments_user_or_group_exclusive'
    ) THEN
        ALTER TABLE learning_path_assignments 
        ADD CONSTRAINT learning_path_assignments_user_or_group_exclusive 
        CHECK (
            (user_id IS NOT NULL AND group_id IS NULL) OR 
            (user_id IS NULL AND group_id IS NOT NULL)
        );
        
        RAISE NOTICE 'Added user or group exclusive constraint';
    END IF;

    -- Unique user path constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'learning_path_assignments' 
        AND constraint_name = 'learning_path_assignments_unique_user_path'
    ) THEN
        ALTER TABLE learning_path_assignments 
        ADD CONSTRAINT learning_path_assignments_unique_user_path 
        UNIQUE (path_id, user_id);
        
        RAISE NOTICE 'Added unique user path constraint';
    END IF;

    -- Unique group path constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'learning_path_assignments' 
        AND constraint_name = 'learning_path_assignments_unique_group_path'
    ) THEN
        ALTER TABLE learning_path_assignments 
        ADD CONSTRAINT learning_path_assignments_unique_group_path 
        UNIQUE (path_id, group_id);
        
        RAISE NOTICE 'Added unique group path constraint';
    END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view learning paths they created or are assigned to" ON learning_paths;
DROP POLICY IF EXISTS "Admins and authorized users can create learning paths" ON learning_paths;
DROP POLICY IF EXISTS "Users can update their own learning paths" ON learning_paths;
DROP POLICY IF EXISTS "Users can delete their own learning paths" ON learning_paths;

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
    ) OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
    )
);

CREATE POLICY "Authorized users can create learning paths" 
ON learning_paths FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
        AND is_active = true
    )
);

CREATE POLICY "Users can update their own learning paths or admins can update all" 
ON learning_paths FOR UPDATE 
USING (
    created_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
    )
);

CREATE POLICY "Users can delete their own learning paths or admins can delete all" 
ON learning_paths FOR DELETE 
USING (
    created_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
    )
);

-- Learning Path Courses RLS Policies
DROP POLICY IF EXISTS "Users can view courses in paths they have access to" ON learning_path_courses;
DROP POLICY IF EXISTS "Path creators can manage courses in their paths" ON learning_path_courses;

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
    ) OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
    )
);

CREATE POLICY "Authorized users can manage courses in paths" 
ON learning_path_courses FOR ALL 
USING (
    path_id IN (
        SELECT id FROM learning_paths 
        WHERE created_by = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
        AND is_active = true
    )
);

-- Learning Path Assignments RLS Policies
DROP POLICY IF EXISTS "Users can view assignments they created or are assigned to" ON learning_path_assignments;
DROP POLICY IF EXISTS "Authorized users can create assignments" ON learning_path_assignments;
DROP POLICY IF EXISTS "Assignment creators can update their assignments" ON learning_path_assignments;
DROP POLICY IF EXISTS "Assignment creators can delete their assignments" ON learning_path_assignments;

CREATE POLICY "Users can view assignments they created or are assigned to" 
ON learning_path_assignments FOR SELECT 
USING (
    assigned_by = auth.uid() OR
    user_id = auth.uid() OR
    group_id IN (
        SELECT community_id FROM user_roles 
        WHERE user_id = auth.uid() AND is_active = true
    ) OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
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

CREATE POLICY "Assignment creators can update their assignments or admins can update all" 
ON learning_path_assignments FOR UPDATE 
USING (
    assigned_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
    )
);

CREATE POLICY "Assignment creators can delete their assignments or admins can delete all" 
ON learning_path_assignments FOR DELETE 
USING (
    assigned_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type = 'admin'
        AND is_active = true
    )
);

-- =====================================================
-- 5. USEFUL VIEWS FOR COMMON QUERIES
-- =====================================================

-- Drop existing views if they exist
DROP VIEW IF EXISTS learning_paths_with_courses;
DROP VIEW IF EXISTS learning_path_assignments_with_details;

-- View: Complete Learning Paths with Course Details
CREATE VIEW learning_paths_with_courses AS
SELECT 
    lp.id,
    lp.name,
    lp.description,
    lp.school_id,
    lp.generation_id,
    lp.is_active,
    lp.path_data,
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
GROUP BY lp.id, lp.name, lp.description, lp.school_id, lp.generation_id, lp.is_active, lp.path_data, lp.created_by, lp.created_at, lp.updated_at;

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
    assignment_type TEXT,
    school_id INTEGER,
    generation_id UUID,
    is_active BOOLEAN
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
        'direct'::TEXT,
        lp.school_id,
        lp.generation_id,
        lp.is_active
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
        'group'::TEXT,
        lp.school_id,
        lp.generation_id,
        lp.is_active
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
        
        UNION
        
        -- Admin access
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = target_user_id
        AND ur.role_type = 'admin'
        AND ur.is_active = true
    );
$$;

-- =====================================================
-- 7. ADD HELPFUL COMMENTS
-- =====================================================

COMMENT ON TABLE learning_paths IS 'Learning paths with existing FNE structure (school_id, generation_id, etc.)';
COMMENT ON TABLE learning_path_courses IS 'Courses included in each learning path with sequence order';
COMMENT ON TABLE learning_path_assignments IS 'Assignment tracking - links paths to users or groups';

COMMENT ON COLUMN learning_path_courses.sequence IS 'Order of courses in the path (1-based, must be positive and unique per path)';
COMMENT ON COLUMN learning_path_assignments.user_id IS 'Individual user assignment (mutually exclusive with group_id)';
COMMENT ON COLUMN learning_path_assignments.group_id IS 'Group assignment (mutually exclusive with user_id)';
COMMENT ON COLUMN learning_path_assignments.assigned_by IS 'User who made this assignment';

-- =====================================================
-- MIGRATION VERIFICATION
-- =====================================================

DO $$
BEGIN
    -- Check that all tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_paths') THEN
        RAISE EXCEPTION 'Migration failed: learning_paths table not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_path_courses') THEN
        RAISE EXCEPTION 'Migration failed: learning_path_courses table not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_path_assignments') THEN
        RAISE EXCEPTION 'Migration failed: learning_path_assignments table not created';
    END IF;
    
    -- Check views exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'learning_paths_with_courses') THEN
        RAISE EXCEPTION 'Migration failed: learning_paths_with_courses view not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'learning_path_assignments_with_details') THEN
        RAISE EXCEPTION 'Migration failed: learning_path_assignments_with_details view not created';
    END IF;
    
    RAISE NOTICE '✅ Learning Paths migration completed successfully!';
    RAISE NOTICE 'Tables: learning_paths (existing), learning_path_courses (enhanced), learning_path_assignments (new)';
    RAISE NOTICE 'Views: learning_paths_with_courses, learning_path_assignments_with_details';
    RAISE NOTICE 'Functions: get_user_learning_paths, user_can_access_learning_path';
    RAISE NOTICE 'RLS policies: Comprehensive access control for all roles';
END $$;