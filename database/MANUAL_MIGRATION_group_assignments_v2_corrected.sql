-- GROUP ASSIGNMENTS V2 - CORRECTED VERSION
-- Run this script in Supabase SQL Editor

-- Step 1: Create the tables
-- =========================================

-- Table for group assignment groups
CREATE TABLE IF NOT EXISTS group_assignment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id TEXT NOT NULL, -- Format: lessonId_block_blockIndex
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

-- Step 2: Create indexes for performance
-- =========================================

CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_assignment_id ON group_assignment_groups(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_groups_community_id ON group_assignment_groups(community_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_group_id ON group_assignment_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_members_user_id ON group_assignment_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_assignment_id ON group_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_group_id ON group_assignment_submissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_assignment_submissions_user_id ON group_assignment_submissions(user_id);

-- Step 3: Enable Row Level Security
-- =========================================

ALTER TABLE group_assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS Policies (CORRECTED)
-- =========================================

-- Policies for group_assignment_groups
DROP POLICY IF EXISTS "Students can view groups in their community" ON group_assignment_groups;
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

DROP POLICY IF EXISTS "Students can create groups in their community" ON group_assignment_groups;
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

-- Policies for group_assignment_members
DROP POLICY IF EXISTS "Students can view group members" ON group_assignment_members;
CREATE POLICY "Students can view group members" ON group_assignment_members
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_assignment_members WHERE user_id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Students can join groups" ON group_assignment_members;
CREATE POLICY "Students can join groups" ON group_assignment_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_assignment_groups gag
      JOIN user_roles ur ON ur.community_id = gag.community_id
      WHERE gag.id = group_assignment_members.group_id
      AND ur.id = auth.uid()
      AND ur.is_active = true
    )
    AND user_id = auth.uid()
  );

-- Policies for group_assignment_submissions
DROP POLICY IF EXISTS "Students can view own submissions" ON group_assignment_submissions;
CREATE POLICY "Students can view own submissions" ON group_assignment_submissions
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Students can submit assignments" ON group_assignment_submissions;
CREATE POLICY "Students can submit assignments" ON group_assignment_submissions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Students can update own submissions" ON group_assignment_submissions;
CREATE POLICY "Students can update own submissions" ON group_assignment_submissions
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Consultants can view submissions" ON group_assignment_submissions;
CREATE POLICY "Consultants can view submissions" ON group_assignment_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM consultant_assignments ca
      JOIN group_assignment_groups gag ON gag.community_id = ca.community_id
      WHERE ca.consultant_id = auth.uid()
      AND gag.id = group_assignment_submissions.group_id
      AND ca.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles WHERE id = auth.uid() AND role_type = 'admin' AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Consultants can grade submissions" ON group_assignment_submissions;
CREATE POLICY "Consultants can grade submissions" ON group_assignment_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM consultant_assignments ca
      JOIN group_assignment_groups gag ON gag.community_id = ca.community_id
      WHERE ca.consultant_id = auth.uid()
      AND gag.id = group_assignment_submissions.group_id
      AND ca.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles WHERE id = auth.uid() AND role_type = 'admin' AND is_active = true
    )
  );

-- Step 5: Create helpful view
-- =========================================

DROP VIEW IF EXISTS group_assignments_with_status;
CREATE VIEW group_assignments_with_status AS
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

-- Step 6: Grant necessary permissions
-- =========================================

GRANT SELECT ON group_assignments_with_status TO authenticated;

-- Step 7: Verify installation
-- =========================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Group Assignments V2 Installation Complete ===';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  - group_assignment_groups';
    RAISE NOTICE '  - group_assignment_members';
    RAISE NOTICE '  - group_assignment_submissions';
    RAISE NOTICE '';
    RAISE NOTICE 'View created:';
    RAISE NOTICE '  - group_assignments_with_status';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Create storage bucket "assignments" in Supabase dashboard';
    RAISE NOTICE '  2. Test the group assignment functionality';
    RAISE NOTICE '';
END $$;

-- Done! The group assignments v2 system is now ready to use.