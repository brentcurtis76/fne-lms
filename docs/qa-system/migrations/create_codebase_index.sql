-- Migration: Create codebase_index table
-- Purpose: Store analyzed code summaries for QA scenario generation
-- Date: 2026-01-14

-- Create the codebase_index table
CREATE TABLE IF NOT EXISTS codebase_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_area TEXT NOT NULL,
  route TEXT,
  file_path TEXT,
  roles_allowed TEXT[],
  component_summary TEXT,
  key_behaviors JSONB,
  expected_outcomes JSONB,
  last_indexed TIMESTAMPTZ DEFAULT NOW(),
  indexed_by TEXT DEFAULT 'claude-code',
  UNIQUE(feature_area, route)
);

-- Create index for faster feature_area lookups
CREATE INDEX IF NOT EXISTS idx_codebase_index_feature_area ON codebase_index(feature_area);

-- Create index for last_indexed to find stale entries
CREATE INDEX IF NOT EXISTS idx_codebase_index_last_indexed ON codebase_index(last_indexed);

-- Enable RLS
ALTER TABLE codebase_index ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can read/write
CREATE POLICY "Admins can manage codebase_index" ON codebase_index
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role_type = 'admin'
      AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role_type = 'admin'
      AND user_roles.is_active = true
    )
  );

-- Grant service role full access (for API operations)
GRANT ALL ON codebase_index TO service_role;

-- Comment on table
COMMENT ON TABLE codebase_index IS 'Stores analyzed code summaries for AI-powered QA scenario generation';
COMMENT ON COLUMN codebase_index.feature_area IS 'Logical grouping (e.g., user_management, course_management)';
COMMENT ON COLUMN codebase_index.route IS 'URL route for this feature (e.g., /admin/user-management)';
COMMENT ON COLUMN codebase_index.file_path IS 'Primary file path for this route';
COMMENT ON COLUMN codebase_index.roles_allowed IS 'Array of roles that can access this feature';
COMMENT ON COLUMN codebase_index.component_summary IS 'Human-readable summary of the component';
COMMENT ON COLUMN codebase_index.key_behaviors IS 'JSON object describing key UI behaviors and actions';
COMMENT ON COLUMN codebase_index.expected_outcomes IS 'JSON object describing expected outcomes for success/failure';
COMMENT ON COLUMN codebase_index.last_indexed IS 'When this entry was last updated';
COMMENT ON COLUMN codebase_index.indexed_by IS 'Who/what created this index entry';
