-- Create learning_path_assignments table for managing learning path assignments to users and groups
CREATE TABLE IF NOT EXISTS learning_path_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES community_workspaces(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT learning_path_assignments_user_or_group_exclusive 
        CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)),
    CONSTRAINT learning_path_assignments_unique_user_path 
        UNIQUE (user_id, path_id),
    CONSTRAINT learning_path_assignments_unique_group_path 
        UNIQUE (group_id, path_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);

-- Enable RLS
ALTER TABLE learning_path_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view assignments they created or are assigned to" 
ON learning_path_assignments FOR SELECT 
USING (
    auth.uid() = user_id OR 
    auth.uid() = assigned_by OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) OR
    (group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND community_id = group_id 
        AND is_active = true
    ))
);

CREATE POLICY "Authorized users can create assignments" 
ON learning_path_assignments FOR INSERT 
WITH CHECK (
    auth.uid() = assigned_by AND
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    )
);

CREATE POLICY "Assignment creators can update their assignments" 
ON learning_path_assignments FOR UPDATE 
USING (
    auth.uid() = assigned_by OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND role_type = 'admin'
    )
);

CREATE POLICY "Assignment creators can delete their assignments" 
ON learning_path_assignments FOR DELETE 
USING (
    auth.uid() = assigned_by OR
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND is_active = true 
        AND role_type = 'admin'
    )
);