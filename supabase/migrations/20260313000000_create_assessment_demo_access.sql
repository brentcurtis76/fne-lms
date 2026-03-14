-- Create assessment_demo_access table
-- Tracks which users have demo access to published assessment templates

CREATE TABLE IF NOT EXISTS assessment_demo_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, user_id)
);

-- Index for fast lookup by template
CREATE INDEX idx_demo_access_template ON assessment_demo_access(template_id);

-- Index for fast lookup by user
CREATE INDEX idx_demo_access_user ON assessment_demo_access(user_id);

-- Enable RLS
ALTER TABLE assessment_demo_access ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "admin_full_access" ON assessment_demo_access
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

-- Users can read their own demo access
CREATE POLICY "user_read_own" ON assessment_demo_access
  FOR SELECT
  USING (user_id = auth.uid());
