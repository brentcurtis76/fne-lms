-- ============================================================
-- ACTIVITY_FEED RLS TIGHTENING - STAGING ONLY
-- Date: 2025-01-05
-- Purpose: Scope activity_feed SELECT to workspace members
-- Priority: HIGH (privacy concern)
-- Status: STAGING-ONLY MIGRATION
-- ============================================================

-- APPLY SCRIPT
BEGIN;

-- Drop existing overly-permissive policy
DROP POLICY IF EXISTS "authenticated_read_activity_feed" ON public.activity_feed;

-- Create workspace-scoped policy for regular users
CREATE POLICY "workspace_members_read_activity_feed" 
ON public.activity_feed 
FOR SELECT 
TO authenticated
USING (
  -- Users can see activity in their workspaces
  workspace_id IN (
    SELECT DISTINCT workspace_id 
    FROM public.community_workspace_members 
    WHERE user_id = auth.uid()
  )
  OR
  -- Authors can see their own activity
  user_id = auth.uid()
);

-- Admin/Consultant bypass policy
CREATE POLICY "admin_consultant_read_all_activity_feed" 
ON public.activity_feed 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'consultor')
    AND ur.is_active = true
  )
);

-- Service role maintains full access
-- (Existing policy "service_role_bypass_activity_feed" remains)

COMMIT;

-- ============================================================
-- VERIFICATION PROBES (Run as different roles)
-- ============================================================

-- 1. Test as anonymous (should fail - 401)
-- SELECT COUNT(*) FROM public.activity_feed;

-- 2. Test as non-member (should see 0 rows)
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claims TO '{"sub": "test-non-member-user-id"}';
-- SELECT COUNT(*) FROM public.activity_feed;

-- 3. Test as workspace member (should see workspace activity)
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claims TO '{"sub": "actual-member-user-id"}';
-- SELECT COUNT(*) FROM public.activity_feed;

-- 4. Test as author (should see own activity)
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claims TO '{"sub": "author-user-id"}';
-- SELECT COUNT(*) FROM public.activity_feed WHERE user_id = 'author-user-id';

-- 5. Test as admin (should see all)
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claims TO '{"sub": "admin-user-id"}';
-- SELECT COUNT(*) FROM public.activity_feed;

-- 6. Test as service_role (should see all)
-- SET LOCAL role TO service_role;
-- SELECT COUNT(*) FROM public.activity_feed;

-- ============================================================
-- ROLLBACK SCRIPT
-- ============================================================
/*
BEGIN;

-- Drop new policies
DROP POLICY IF EXISTS "workspace_members_read_activity_feed" ON public.activity_feed;
DROP POLICY IF EXISTS "admin_consultant_read_all_activity_feed" ON public.activity_feed;

-- Restore original containment policy
CREATE POLICY "authenticated_read_activity_feed" 
ON public.activity_feed 
FOR SELECT 
TO authenticated
USING (true);

COMMIT;
*/

-- ============================================================
-- EXPECTED RESULTS MATRIX
-- ============================================================
-- Role                 | Can See              | Expected Count
-- ---------------------|---------------------|---------------
-- Anonymous            | Nothing (401)        | Error
-- Non-member          | Nothing              | 0
-- Workspace Member    | Workspace activity   | > 0 (workspace specific)
-- Activity Author     | Own activity         | >= 1
-- Admin               | All activity         | All rows
-- Consultant          | All activity         | All rows
-- Service Role        | All activity         | All rows