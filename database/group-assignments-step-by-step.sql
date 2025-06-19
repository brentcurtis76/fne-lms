-- GROUP ASSIGNMENTS V2 - STEP BY STEP DEBUGGING
-- Run each section separately to identify where the error occurs

-- SECTION 1: Create tables only (no policies)
-- =========================================
BEGIN;

-- Table for group assignment groups
CREATE TABLE IF NOT EXISTS group_assignment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id TEXT NOT NULL,
  community_id UUID NOT NULL REFERENCES growth_communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for group members
CREATE TABLE IF NOT EXISTS group_assignment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES group_assignment_groups(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, user_id)
);

-- Table for group submissions
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

COMMIT;

-- If Section 1 succeeds, continue with Section 2

-- SECTION 2: Create indexes
-- =========================================
CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_assignment_id ON group_assignment_groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_community_id ON group_assignment_groups(community_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_group_id ON group_assignment_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_user_id ON group_assignment_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_assignment_id ON group_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_group_id ON group_assignment_submissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_user_id ON group_assignment_submissions(user_id);

-- SECTION 3: Enable RLS
-- =========================================
ALTER TABLE group_assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_submissions ENABLE ROW LEVEL SECURITY;

-- SECTION 4: Test each policy individually
-- =========================================

-- Policy 4.1: Test this first
CREATE POLICY "Students can view groups in their community" ON group_assignment_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.id = auth.uid() 
      AND user_roles.community_id = group_assignment_groups.community_id
      AND user_roles.is_active = true
    )
  );

-- If 4.1 works, test 4.2
CREATE POLICY "Students can create groups in their community" ON group_assignment_groups
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.id = auth.uid() 
      AND user_roles.community_id = group_assignment_groups.community_id
      AND user_roles.is_active = true
    )
  );

-- Continue testing each policy one by one...