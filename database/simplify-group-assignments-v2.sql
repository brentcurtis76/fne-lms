-- Simplify group assignments to work directly with lesson blocks
-- This migration updates the existing tables to support the new simplified flow

-- Create a table for group assignment groups (simplified)
CREATE TABLE IF NOT EXISTS group_assignment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id TEXT NOT NULL, -- Format: lessonId_block_blockIndex
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create a table for group members
CREATE TABLE IF NOT EXISTS group_assignment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES group_assignment_groups(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, user_id)
);

-- Create a table for group submissions (simplified)
CREATE TABLE IF NOT EXISTS group_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id TEXT NOT NULL,
  group_id UUID NOT NULL REFERENCES group_assignment_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded')),
  grade DECIMAL(5,2),
  feedback TEXT,
  submitted_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_assignment_id ON group_assignment_groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_community_id ON group_assignment_groups(community_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_group_id ON group_assignment_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_user_id ON group_assignment_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_assignment_id ON group_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_group_id ON group_assignment_submissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_user_id ON group_assignment_submissions(user_id);

-- Enable RLS
ALTER TABLE group_assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_assignment_groups
-- Students can view groups in their community
CREATE POLICY "Students can view groups in their community" ON group_assignment_groups
  FOR SELECT
  USING (
    community_id IN (
      SELECT community_id FROM user_profiles WHERE user_id = auth.uid()
    )
  );

-- Students can create groups in their community
CREATE POLICY "Students can create groups in their community" ON group_assignment_groups
  FOR INSERT
  WITH CHECK (
    community_id IN (
      SELECT community_id FROM user_profiles WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for group_assignment_members
-- Students can view members of groups they belong to
CREATE POLICY "Students can view group members" ON group_assignment_members
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_assignment_members WHERE user_id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );

-- Students can join groups in their community
CREATE POLICY "Students can join groups" ON group_assignment_members
  FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT id FROM group_assignment_groups WHERE community_id IN (
        SELECT community_id FROM user_profiles WHERE user_id = auth.uid()
      )
    )
    AND user_id = auth.uid()
  );

-- RLS Policies for group_assignment_submissions
-- Students can view their own submissions
CREATE POLICY "Students can view own submissions" ON group_assignment_submissions
  FOR SELECT
  USING (user_id = auth.uid());

-- Students can create/update their own submissions
CREATE POLICY "Students can submit assignments" ON group_assignment_submissions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students can update own submissions" ON group_assignment_submissions
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending');

-- Consultants can view and grade submissions for their assigned communities
CREATE POLICY "Consultants can view submissions" ON group_assignment_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultant_assignments ca
      JOIN group_assignment_groups gag ON gag.community_id = ca.assigned_entity_id
      WHERE ca.consultant_id = auth.uid()
      AND ca.assigned_entity_type = 'community'
      AND gag.id = group_assignment_submissions.group_id
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Consultants can grade submissions" ON group_assignment_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM consultant_assignments ca
      JOIN group_assignment_groups gag ON gag.community_id = ca.assigned_entity_id
      WHERE ca.consultant_id = auth.uid()
      AND ca.assigned_entity_type = 'community'
      AND gag.id = group_assignment_submissions.group_id
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create a view for easier querying of group assignments with all related data
CREATE OR REPLACE VIEW group_assignments_with_status AS
SELECT 
  gas.assignment_id,
  gas.user_id,
  gas.group_id,
  gag.name as group_name,
  gag.community_id,
  gas.status,
  gas.grade,
  gas.feedback,
  gas.submitted_at,
  gas.graded_at,
  COUNT(gam.id) as group_member_count
FROM group_assignment_submissions gas
JOIN group_assignment_groups gag ON gag.id = gas.group_id
LEFT JOIN group_assignment_members gam ON gam.group_id = gas.group_id
GROUP BY gas.assignment_id, gas.user_id, gas.group_id, gag.name, gag.community_id, 
         gas.status, gas.grade, gas.feedback, gas.submitted_at, gas.graded_at;