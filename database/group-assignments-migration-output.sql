-- Add group assignment support to existing lesson_assignments table
-- Phase 2: Group assignments for collaborative space

-- Add new columns to lesson_assignments table
ALTER TABLE lesson_assignments 
ADD COLUMN IF NOT EXISTS assignment_for TEXT DEFAULT 'individual' CHECK (assignment_for IN ('individual', 'group')),
ADD COLUMN IF NOT EXISTS assigned_to_community_id UUID REFERENCES growth_communities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS max_group_size INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS min_group_size INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS allow_self_grouping BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS require_all_members_submit BOOLEAN DEFAULT false;

-- Create group_assignment_members table to track group membership
CREATE TABLE IF NOT EXISTS group_assignment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES lesson_assignments(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES growth_communities(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT unique_assignment_user UNIQUE (assignment_id, user_id),
  CONSTRAINT unique_group_user UNIQUE (group_id, user_id)
);

-- Create group_assignment_submissions table
CREATE TABLE IF NOT EXISTS group_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES lesson_assignments(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  community_id UUID NOT NULL REFERENCES growth_communities(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submission_content TEXT,
  file_urls TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
  score DECIMAL(5,2),
  feedback TEXT,
  graded_by UUID REFERENCES profiles(id),
  graded_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT unique_group_submission UNIQUE (assignment_id, group_id)
);

-- Create group discussion threads table
CREATE TABLE IF NOT EXISTS group_assignment_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES lesson_assignments(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT unique_group_discussion UNIQUE (assignment_id, group_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_assignments_community ON lesson_assignments(assigned_to_community_id);
CREATE INDEX IF NOT EXISTS idx_lesson_assignments_for ON lesson_assignments(assignment_for);
CREATE INDEX IF NOT EXISTS idx_group_members_assignment ON group_assignment_members(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_assignment_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_assignment_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_submissions_assignment ON group_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_submissions_group ON group_assignment_submissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_discussions_assignment ON group_assignment_discussions(assignment_id);

-- Enable RLS
ALTER TABLE group_assignment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_discussions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_assignment_members
CREATE POLICY "group_members_view_own_groups"
  ON group_assignment_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_members.group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "group_members_join_groups"
  ON group_assignment_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM lesson_assignments la
      WHERE la.id = assignment_id
      AND la.allow_self_grouping = true
    )
  );

CREATE POLICY "teachers_manage_group_members"
  ON group_assignment_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor', 'equipo_directivo', 'lider_generacion')
    )
  );

-- RLS Policies for group_assignment_submissions
CREATE POLICY "group_submissions_view_own"
  ON group_assignment_submissions FOR SELECT
  USING (
    submitted_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_submissions.group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "group_submissions_create"
  ON group_assignment_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "group_submissions_update_own"
  ON group_assignment_submissions FOR UPDATE
  USING (
    status IN ('draft', 'returned') AND
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_submissions.group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "teachers_manage_group_submissions"
  ON group_assignment_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor', 'equipo_directivo', 'lider_generacion')
    )
  );

-- RLS Policies for group_assignment_discussions
CREATE POLICY "group_discussions_view_own"
  ON group_assignment_discussions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_assignment_discussions.group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "group_discussions_create"
  ON group_assignment_discussions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_assignment_members gam
      WHERE gam.group_id = group_id
      AND gam.user_id = auth.uid()
    )
  );

CREATE POLICY "teachers_manage_group_discussions"
  ON group_assignment_discussions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'consultor', 'equipo_directivo', 'lider_generacion')
    )
  );

-- Create view for group assignments with member counts
CREATE OR REPLACE VIEW group_assignments_with_stats AS
SELECT 
  la.*,
  gc.name as community_name,
  COUNT(DISTINCT gam.group_id) as group_count,
  COUNT(DISTINCT gam.user_id) as total_members,
  COUNT(DISTINCT gas.id) as submission_count,
  COUNT(DISTINCT CASE WHEN gas.status = 'graded' THEN gas.id END) as graded_count
FROM lesson_assignments la
LEFT JOIN growth_communities gc ON la.assigned_to_community_id = gc.id
LEFT JOIN group_assignment_members gam ON la.id = gam.assignment_id
LEFT JOIN group_assignment_submissions gas ON la.id = gas.assignment_id
WHERE la.assignment_for = 'group'
GROUP BY la.id, gc.name;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_group_assignment_submissions_updated_at
    BEFORE UPDATE ON group_assignment_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();