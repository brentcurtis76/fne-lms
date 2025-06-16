-- ====================================================================
-- CONSULTANT ASSIGNMENTS TABLE
-- Stores relationships between consultants and users they monitor/mentor
-- ====================================================================

-- Create the consultant_assignments table
CREATE TABLE IF NOT EXISTS consultant_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core relationship fields
    consultant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Assignment type and permissions
    assignment_type VARCHAR(50) NOT NULL DEFAULT 'monitoring' CHECK (assignment_type IN ('monitoring', 'mentoring', 'evaluation', 'support')),
    can_view_progress BOOLEAN DEFAULT true,
    can_assign_courses BOOLEAN DEFAULT false,
    can_message_student BOOLEAN DEFAULT true,
    
    -- Organizational scope (optional)
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
    community_id UUID REFERENCES growth_communities(id) ON DELETE SET NULL,
    
    -- Time boundaries
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    
    -- Status and tracking
    is_active BOOLEAN DEFAULT true,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notification_sent BOOLEAN DEFAULT false,
    
    -- Additional data
    assignment_data JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT consultant_student_unique UNIQUE(consultant_id, student_id, is_active),
    CONSTRAINT consultant_not_self CHECK (consultant_id != student_id)
);

-- Create indexes for performance
CREATE INDEX idx_consultant_assignments_consultant_id ON consultant_assignments(consultant_id);
CREATE INDEX idx_consultant_assignments_student_id ON consultant_assignments(student_id);
CREATE INDEX idx_consultant_assignments_active ON consultant_assignments(is_active) WHERE is_active = true;
CREATE INDEX idx_consultant_assignments_school_id ON consultant_assignments(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX idx_consultant_assignments_starts_at ON consultant_assignments(starts_at);
CREATE INDEX idx_consultant_assignments_ends_at ON consultant_assignments(ends_at) WHERE ends_at IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE consultant_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admins can view all assignments
CREATE POLICY "admin_view_all_assignments" ON consultant_assignments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
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
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Only admins can update assignments
CREATE POLICY "admin_update_assignments" ON consultant_assignments
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Only admins can delete assignments
CREATE POLICY "admin_delete_assignments" ON consultant_assignments
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_consultant_assignments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_consultant_assignments_updated_at
    BEFORE UPDATE ON consultant_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_consultant_assignments_timestamp();

-- Helper function to get reportable users for a consultant
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
        p.role,
        ca.school_id,
        ca.generation_id,
        ca.community_id,
        ca.assignment_type,
        ca.can_view_progress
    FROM consultant_assignments ca
    JOIN profiles p ON p.id = ca.student_id
    WHERE ca.consultant_id = requesting_user_id
        AND ca.is_active = true
        AND ca.can_view_progress = true
        AND (ca.ends_at IS NULL OR ca.ends_at > NOW())
    ORDER BY p.last_name, p.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_reportable_users(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE consultant_assignments IS 'Stores consultant-student relationships for monitoring, mentoring, and support';
COMMENT ON COLUMN consultant_assignments.assignment_type IS 'Type of assignment: monitoring, mentoring, evaluation, or support';
COMMENT ON COLUMN consultant_assignments.can_view_progress IS 'Whether consultant can view student progress and reports';
COMMENT ON COLUMN consultant_assignments.can_assign_courses IS 'Whether consultant can assign courses to the student';
COMMENT ON COLUMN consultant_assignments.can_message_student IS 'Whether consultant can send messages to the student';
COMMENT ON COLUMN consultant_assignments.assignment_data IS 'Additional JSON data for custom assignment configurations';