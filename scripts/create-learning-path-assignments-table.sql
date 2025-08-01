-- Create learning_path_assignments table
-- This table manages assignments of learning paths to users or groups

CREATE TABLE learning_path_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL,
    user_id UUID NULL,
    group_id UUID NULL,
    assigned_by UUID NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_learning_path_assignments_path_id 
        FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_user_id 
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_group_id 
        FOREIGN KEY (group_id) REFERENCES community_workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_assigned_by 
        FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Business logic constraints
    CONSTRAINT learning_path_assignments_user_or_group_exclusive 
        CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)),
    CONSTRAINT learning_path_assignments_unique_user_path 
        UNIQUE (user_id, path_id),
    CONSTRAINT learning_path_assignments_unique_group_path 
        UNIQUE (group_id, path_id)
);

-- Create indexes for performance
CREATE INDEX idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);

-- Enable RLS (if needed)
ALTER TABLE learning_path_assignments ENABLE ROW LEVEL SECURITY;

-- Grant permissions (adjust as needed for your setup)
GRANT ALL ON learning_path_assignments TO postgres;
GRANT ALL ON learning_path_assignments TO anon;
GRANT ALL ON learning_path_assignments TO authenticated;
GRANT ALL ON learning_path_assignments TO service_role;