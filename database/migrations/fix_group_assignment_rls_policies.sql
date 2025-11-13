-- Fix Group Assignment RLS Policies
-- This migration fixes the broken RLS policies for group assignment tables
-- Issue: Self-referencing condition (ur.community_id = ur.community_id) instead of comparing to table's community_id

-- ============================================================================
-- 1. Fix group_assignment_groups policies
-- ============================================================================

-- Drop ALL existing policies (including any from initial schema)
DROP POLICY IF EXISTS "Users can view groups in their community" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Users can create groups in their community" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Users can update their own groups" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Users can update groups in their community" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Users can delete their own groups" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Users can delete groups in their community" ON "public"."group_assignment_groups";
-- Drop any auto-generated or legacy policy names
DROP POLICY IF EXISTS "Enable read access for users in same community" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Enable insert for users in same community" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Enable update for group members" ON "public"."group_assignment_groups";
DROP POLICY IF EXISTS "Enable delete for group creators" ON "public"."group_assignment_groups";

-- Create corrected SELECT policy with admin bypass
CREATE POLICY "Users can view groups in their community"
ON "public"."group_assignment_groups"
FOR SELECT
USING (
  -- Admin bypass: Admins can see all groups
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Regular users: Can see groups in their community
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."community_id" = "group_assignment_groups"."community_id"  -- FIX: Reference the table
      AND "ur"."is_active" = true
  )
);

-- Create corrected INSERT policy
CREATE POLICY "Users can create groups in their community"
ON "public"."group_assignment_groups"
FOR INSERT
WITH CHECK (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Regular users: Can create groups in their community
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."community_id" = "group_assignment_groups"."community_id"  -- FIX
      AND "ur"."is_active" = true
  )
);

-- Create UPDATE policy
CREATE POLICY "Users can update groups in their community"
ON "public"."group_assignment_groups"
FOR UPDATE
USING (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Regular users: Can update groups in their community
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."community_id" = "group_assignment_groups"."community_id"
      AND "ur"."is_active" = true
  )
);

-- Create DELETE policy
CREATE POLICY "Users can delete groups in their community"
ON "public"."group_assignment_groups"
FOR DELETE
USING (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Regular users: Can delete groups in their community
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."community_id" = "group_assignment_groups"."community_id"
      AND "ur"."is_active" = true
  )
);

-- ============================================================================
-- 2. Fix group_assignment_members policies
-- ============================================================================

-- Drop ALL existing policies (including any from initial schema)
DROP POLICY IF EXISTS "Users can view their own group memberships" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Users can view group memberships in their community" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Users can join groups" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Users can join groups in their community" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Users can update group memberships in their community" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Users can leave groups" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Users can leave groups in their community" ON "public"."group_assignment_members";
-- Drop any auto-generated or legacy policy names
DROP POLICY IF EXISTS "group_members_view_own_groups" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "group_members_join_groups" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "teachers_manage_group_members" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Enable read access for group members" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Enable update for group members" ON "public"."group_assignment_members";
DROP POLICY IF EXISTS "Enable delete for own membership" ON "public"."group_assignment_members";

-- Create corrected SELECT policy
CREATE POLICY "Users can view group memberships in their community"
ON "public"."group_assignment_members"
FOR SELECT
USING (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- User is a member of this group
  "user_id" = "auth"."uid"()
  OR
  -- User is in the same community as the group
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "ur" ON "ur"."community_id" = "gag"."community_id"
    WHERE "gag"."id" = "group_assignment_members"."group_id"
      AND "ur"."user_id" = "auth"."uid"()
      AND "ur"."is_active" = true
  )
);

-- Create corrected INSERT policy
CREATE POLICY "Users can join groups in their community"
ON "public"."group_assignment_members"
FOR INSERT
WITH CHECK (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- User can join groups in their own community
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "ur" ON "ur"."community_id" = "gag"."community_id"
    WHERE "gag"."id" = "group_assignment_members"."group_id"
      AND "ur"."user_id" = "auth"."uid"()
      AND "ur"."is_active" = true
  )
);

-- Create UPDATE policy
CREATE POLICY "Users can update group memberships in their community"
ON "public"."group_assignment_members"
FOR UPDATE
USING (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- User is a member of this group
  "user_id" = "auth"."uid"()
  OR
  -- User is in the same community
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "ur" ON "ur"."community_id" = "gag"."community_id"
    WHERE "gag"."id" = "group_assignment_members"."group_id"
      AND "ur"."user_id" = "auth"."uid"()
      AND "ur"."is_active" = true
  )
);

-- Create DELETE policy
CREATE POLICY "Users can leave groups in their community"
ON "public"."group_assignment_members"
FOR DELETE
USING (
  -- Admin bypass
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- User can leave their own groups
  "user_id" = "auth"."uid"()
  OR
  -- Consultants can remove members from groups in their community
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "ur" ON "ur"."community_id" = "gag"."community_id"
    WHERE "gag"."id" = "group_assignment_members"."group_id"
      AND "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" IN ('admin', 'consultor')
      AND "ur"."is_active" = true
  )
);

-- ============================================================================
-- 3. Ensure RLS is enabled
-- ============================================================================

ALTER TABLE "public"."group_assignment_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."group_assignment_members" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. Verification query (run manually to test)
-- ============================================================================

-- To verify the policies work, run these queries as different users:
--
-- As admin (should see all groups):
-- SELECT * FROM group_assignment_groups;
--
-- As regular user (should only see their community's groups):
-- SELECT * FROM group_assignment_groups;
--
-- As user trying to insert (should only work for their community):
-- INSERT INTO group_assignment_groups (assignment_id, community_id, name)
-- VALUES ('test-assignment-id', 'their-community-id', 'Test Group');
