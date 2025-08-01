-- =====================================================
-- MANUAL MIGRATION: Create learning_path_assignments table
-- =====================================================
-- Execute this SQL in Supabase Dashboard > SQL Editor
-- Then run: node scripts/test-learning-path-assignment-db.js

-- Create the main table
CREATE TABLE IF NOT EXISTS learning_path_assignments (
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

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);

-- Enable Row Level Security
ALTER TABLE learning_path_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "learning_path_assignments_select_policy" 
ON learning_path_assignments FOR SELECT 
USING (true);

CREATE POLICY "learning_path_assignments_insert_policy" 
ON learning_path_assignments FOR INSERT 
WITH CHECK (true);

CREATE POLICY "learning_path_assignments_update_policy" 
ON learning_path_assignments FOR UPDATE 
USING (true);

CREATE POLICY "learning_path_assignments_delete_policy" 
ON learning_path_assignments FOR DELETE 
USING (true);

-- Verify table was created
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'learning_path_assignments'
ORDER BY ordinal_position;