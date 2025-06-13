-- Add Assignment Instance/Template Pattern
-- This migration adds support for reusable assignment templates and specific instances

-- Create assignment templates table
CREATE TABLE IF NOT EXISTS assignment_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    block_id UUID NOT NULL, -- Reference to the block in the lesson
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,
    assignment_type VARCHAR(20) CHECK (assignment_type IN ('individual', 'group')) DEFAULT 'individual',
    
    -- Group assignment specific fields
    min_group_size INTEGER DEFAULT 2,
    max_group_size INTEGER DEFAULT 5,
    submission_type VARCHAR(50) DEFAULT 'file', -- file, text, url, etc.
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

-- Create assignment instances table (formerly lesson_assignments)
CREATE TABLE IF NOT EXISTS assignment_instances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID REFERENCES assignment_templates(id) ON DELETE CASCADE,
    
    -- Instance specific data
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL, -- Can override template title
    description TEXT, -- Can override template description
    instructions TEXT, -- Can override template instructions
    
    -- Cohort/School targeting
    school_id INTEGER REFERENCES schools(id),
    community_id UUID, -- For specific communities
    cohort_name VARCHAR(255), -- Free text for cohort identification
    
    -- Instance timing
    start_date TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    
    -- Group configuration (for group assignments)
    groups JSONB DEFAULT '[]'::jsonb, -- Array of groups with members
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
    
    -- We'll enforce the template-course relationship via trigger instead
);

-- Create assignment submissions table (updated)
CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    instance_id UUID REFERENCES assignment_instances(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    group_id VARCHAR(100), -- For group submissions
    
    -- Submission content
    content JSONB DEFAULT '{}'::jsonb,
    file_url TEXT,
    submission_type VARCHAR(50),
    
    -- Status and grading
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
    grade DECIMAL(5,2),
    feedback TEXT,
    graded_by UUID REFERENCES profiles(id),
    graded_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique submission per user/group per instance
    CONSTRAINT unique_submission_per_instance UNIQUE (instance_id, user_id, group_id)
);

-- Create indexes for performance
CREATE INDEX idx_assignment_templates_lesson ON assignment_templates(lesson_id);
CREATE INDEX idx_assignment_instances_template ON assignment_instances(template_id);
CREATE INDEX idx_assignment_instances_course ON assignment_instances(course_id);
CREATE INDEX idx_assignment_instances_status ON assignment_instances(status);
CREATE INDEX idx_assignment_submissions_instance ON assignment_submissions(instance_id);
CREATE INDEX idx_assignment_submissions_user ON assignment_submissions(user_id);

-- Create RLS policies for assignment_templates
ALTER TABLE assignment_templates ENABLE ROW LEVEL SECURITY;

-- Admins and consultors can view all templates
CREATE POLICY "View assignment templates" ON assignment_templates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'consultor')
        )
    );

-- Only admins can create/update/delete templates
CREATE POLICY "Manage assignment templates" ON assignment_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Create RLS policies for assignment_instances
ALTER TABLE assignment_instances ENABLE ROW LEVEL SECURITY;

-- View policies
CREATE POLICY "View assignment instances - admin/consultor" ON assignment_instances
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'consultor')
        )
    );

CREATE POLICY "View assignment instances - students" ON assignment_instances
    FOR SELECT
    USING (
        status = 'active' AND
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN course_enrollments ce ON ce.user_id = p.id
            WHERE p.id = auth.uid()
            AND ce.course_id = assignment_instances.course_id
            AND p.role IN ('docente', 'equipo_directivo', 'lider_generacion', 'lider_comunidad')
        )
    );

-- Manage policies
CREATE POLICY "Create assignment instances" ON assignment_instances
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'consultor')
        )
    );

CREATE POLICY "Update assignment instances" ON assignment_instances
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'consultor')
        )
    );

CREATE POLICY "Delete assignment instances" ON assignment_instances
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Create RLS policies for assignment_submissions
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Students can view their own submissions
CREATE POLICY "View own submissions" ON assignment_submissions
    FOR SELECT
    USING (user_id = auth.uid());

-- Instructors can view all submissions for their assignments
CREATE POLICY "View all submissions - instructors" ON assignment_submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN assignment_instances ai ON ai.id = assignment_submissions.instance_id
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'consultor')
        )
    );

-- Students can create/update their own submissions
CREATE POLICY "Manage own submissions" ON assignment_submissions
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Function to create assignment template from block
CREATE OR REPLACE FUNCTION create_assignment_template_from_block(
    p_lesson_id UUID,
    p_block_id UUID,
    p_block_data JSONB,
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_template_id UUID;
    v_assignment_type VARCHAR(20);
BEGIN
    -- Determine assignment type
    v_assignment_type := CASE 
        WHEN p_block_data->>'type' = 'group-assignment' THEN 'group'
        ELSE 'individual'
    END;
    
    -- Create or update template
    INSERT INTO assignment_templates (
        lesson_id,
        block_id,
        title,
        description,
        instructions,
        assignment_type,
        min_group_size,
        max_group_size,
        created_by
    ) VALUES (
        p_lesson_id,
        p_block_id,
        COALESCE(p_block_data->'payload'->>'title', 'Sin título'),
        p_block_data->'payload'->>'description',
        p_block_data->'payload'->>'instructions',
        v_assignment_type,
        COALESCE((p_block_data->'payload'->>'min_group_size')::INTEGER, 2),
        COALESCE((p_block_data->'payload'->>'max_group_size')::INTEGER, 5),
        p_created_by
    )
    ON CONFLICT (lesson_id, block_id) 
    DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        instructions = EXCLUDED.instructions,
        min_group_size = EXCLUDED.min_group_size,
        max_group_size = EXCLUDED.max_group_size,
        updated_at = NOW()
    RETURNING id INTO v_template_id;
    
    RETURN v_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add unique constraint for template per block
ALTER TABLE assignment_templates 
ADD CONSTRAINT unique_template_per_block UNIQUE (lesson_id, block_id);

-- Create function to get available assignment templates for a course
CREATE OR REPLACE FUNCTION get_available_assignment_templates(p_course_id UUID)
RETURNS TABLE (
    template_id UUID,
    lesson_id UUID,
    lesson_title VARCHAR(255),
    module_title VARCHAR(255),
    template_title VARCHAR(255),
    assignment_type VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        at.id AS template_id,
        l.id AS lesson_id,
        l.title AS lesson_title,
        m.title AS module_title,
        at.title AS template_title,
        at.assignment_type,
        at.created_at
    FROM assignment_templates at
    JOIN lessons l ON at.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = p_course_id
    ORDER BY m.order_index, l.order_index, at.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration helper: Convert existing lesson_assignments to the new pattern
-- This should be run manually after verifying the data
/*
INSERT INTO assignment_instances (
    id,
    template_id,
    course_id,
    title,
    description,
    instructions,
    due_date,
    groups,
    status,
    created_at,
    created_by
)
SELECT 
    la.id,
    NULL, -- Will need to be linked to templates later
    la.course_id,
    la.title,
    la.description,
    la.instructions,
    la.due_date,
    COALESCE(la.group_assignments, '[]'::jsonb),
    CASE 
        WHEN la.due_date < NOW() THEN 'completed'
        ELSE 'active'
    END,
    la.created_at,
    la.created_by
FROM lesson_assignments la
WHERE NOT EXISTS (
    SELECT 1 FROM assignment_instances ai WHERE ai.id = la.id
);
*/

-- Create trigger to validate template-course relationship
CREATE OR REPLACE FUNCTION validate_assignment_instance_course()
RETURNS TRIGGER AS $$
DECLARE
    v_template_course_id UUID;
BEGIN
    -- Get the course_id for the template's lesson
    SELECT m.course_id INTO v_template_course_id
    FROM assignment_templates at
    JOIN lessons l ON at.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE at.id = NEW.template_id;
    
    -- Check if the course matches
    IF v_template_course_id IS NULL THEN
        RAISE EXCEPTION 'Template not found';
    ELSIF v_template_course_id != NEW.course_id THEN
        RAISE EXCEPTION 'Assignment instance course must match the template lesson course';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_assignment_instance_course_trigger
    BEFORE INSERT OR UPDATE ON assignment_instances
    FOR EACH ROW
    EXECUTE FUNCTION validate_assignment_instance_course();

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_assignment_templates_updated_at 
    BEFORE UPDATE ON assignment_templates
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignment_instances_updated_at 
    BEFORE UPDATE ON assignment_instances
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignment_submissions_updated_at 
    BEFORE UPDATE ON assignment_submissions
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for assignment submissions if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('assignment-submissions', 'assignment-submissions', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for assignment submissions
CREATE POLICY "Allow authenticated users to upload assignment submissions" ON storage.objects
    FOR INSERT 
    TO authenticated
    WITH CHECK (bucket_id = 'assignment-submissions');

CREATE POLICY "Allow users to view assignment submissions" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'assignment-submissions');

CREATE POLICY "Allow users to delete their own assignment submissions" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'assignment-submissions' AND auth.uid()::text = (storage.foldername(name))[3]);