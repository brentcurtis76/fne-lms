-- Fix Group Assignment Submissions RLS Policies
-- This migration fixes the broken RLS policies for group_assignment_submissions table
-- Issue: Overly restrictive policies prevent admins/consultants from viewing student submissions

-- ============================================================================
-- 1. Drop ALL existing policies (including any from initial schema)
-- ============================================================================

-- Drop all known policy names for group_assignment_submissions
DROP POLICY IF EXISTS "Students can view own submissions" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Students can submit assignments" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Students can update own submissions" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Users can view submissions based on role" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Users can create submissions based on role" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Users can update submissions based on role" ON "public"."group_assignment_submissions";
-- Drop any auto-generated or legacy policy names
DROP POLICY IF EXISTS "Enable read access for submission owner" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Enable update for submission owner" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "Enable delete for submission owner" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "group_submissions_view_own" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "group_submissions_create" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "group_submissions_update_own" ON "public"."group_assignment_submissions";
DROP POLICY IF EXISTS "teachers_manage_group_submissions" ON "public"."group_assignment_submissions";

-- ============================================================================
-- 2. Create comprehensive SELECT policy with role-based access
-- ============================================================================

CREATE POLICY "Users can view submissions based on role"
ON "public"."group_assignment_submissions"
FOR SELECT
USING (
  -- Admin bypass: Admins can see all submissions
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Users can view their own submissions
  "user_id" = "auth"."uid"()
  OR
  -- Consultants can view submissions from students in their assigned communities
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "consultant_role"
      ON "consultant_role"."community_id" = "gag"."community_id"
      AND "consultant_role"."role_type" = 'consultor'
      AND "consultant_role"."is_active" = true
    WHERE "gag"."id" = "group_assignment_submissions"."group_id"
      AND "consultant_role"."user_id" = "auth"."uid"()
  )
  OR
  -- Users in the same community can view submissions (for group collaboration)
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "ur"
      ON "ur"."community_id" = "gag"."community_id"
      AND "ur"."is_active" = true
    WHERE "gag"."id" = "group_assignment_submissions"."group_id"
      AND "ur"."user_id" = "auth"."uid"()
  )
);

-- ============================================================================
-- 3. Create INSERT policy for submissions
-- ============================================================================

CREATE POLICY "Users can create submissions based on role"
ON "public"."group_assignment_submissions"
FOR INSERT
WITH CHECK (
  -- Admin bypass: Admins can create any submission
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Users can create submissions for themselves
  "user_id" = "auth"."uid"()
  OR
  -- Consultants can create submissions for students in their communities
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "consultant_role"
      ON "consultant_role"."community_id" = "gag"."community_id"
      AND "consultant_role"."role_type" IN ('admin', 'consultor')
      AND "consultant_role"."is_active" = true
    WHERE "gag"."id" = "group_assignment_submissions"."group_id"
      AND "consultant_role"."user_id" = "auth"."uid"()
  )
);

-- ============================================================================
-- 4. Create UPDATE policy for grading and student edits
-- ============================================================================

CREATE POLICY "Users can update submissions based on role"
ON "public"."group_assignment_submissions"
FOR UPDATE
USING (
  -- Admin bypass: Admins can update any submission
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Students can update their own pending submissions
  (
    "user_id" = "auth"."uid"()
    AND "status" IN ('pending', 'draft')
  )
  OR
  -- Consultants can update (grade) submissions in their communities
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "consultant_role"
      ON "consultant_role"."community_id" = "gag"."community_id"
      AND "consultant_role"."role_type" IN ('admin', 'consultor')
      AND "consultant_role"."is_active" = true
    WHERE "gag"."id" = "group_assignment_submissions"."group_id"
      AND "consultant_role"."user_id" = "auth"."uid"()
  )
);

-- ============================================================================
-- 5. Create DELETE policy (restrictive - only admins and consultants)
-- ============================================================================

CREATE POLICY "Admins and consultants can delete submissions"
ON "public"."group_assignment_submissions"
FOR DELETE
USING (
  -- Admin bypass: Admins can delete any submission
  EXISTS (
    SELECT 1 FROM "public"."user_roles" "ur"
    WHERE "ur"."user_id" = "auth"."uid"()
      AND "ur"."role_type" = 'admin'
      AND "ur"."is_active" = true
  )
  OR
  -- Consultants can delete submissions in their communities
  EXISTS (
    SELECT 1
    FROM "public"."group_assignment_groups" "gag"
    JOIN "public"."user_roles" "consultant_role"
      ON "consultant_role"."community_id" = "gag"."community_id"
      AND "consultant_role"."role_type" IN ('admin', 'consultor')
      AND "consultant_role"."is_active" = true
    WHERE "gag"."id" = "group_assignment_submissions"."group_id"
      AND "consultant_role"."user_id" = "auth"."uid"()
  )
);

-- ============================================================================
-- 6. Ensure RLS is enabled
-- ============================================================================

ALTER TABLE "public"."group_assignment_submissions" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. Verification query (run manually to test)
-- ============================================================================

-- To verify the policies work, run these queries as different users:
--
-- As admin (should see all submissions):
-- SELECT * FROM group_assignment_submissions;
--
-- As consultant (should see submissions in their communities):
-- SELECT * FROM group_assignment_submissions;
--
-- As student (should only see their own submissions):
-- SELECT * FROM group_assignment_submissions;
