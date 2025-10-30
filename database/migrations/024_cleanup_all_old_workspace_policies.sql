-- Migration 024: Complete cleanup of old RLS policies for community_workspaces
-- Date: 2025-10-29
-- Issue: Old policies with bugs still exist alongside new secure policies
--
-- PROBLEM: The policy "Community members can view their workspace" has a bug:
--   WHERE ur.community_id = ur.community_id  (always TRUE!)
-- This lets ALL users see ALL workspaces.
--
-- FIX: Drop ALL old policies, keeping only the secure ones from migration 023

-- =============================================================================
-- DROP ALL OLD POLICIES (INCLUDING BUGGY ONES)
-- =============================================================================

-- Drop all policies that are NOT from migration 023
DROP POLICY IF EXISTS "Admins can create workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Allow Admins to manage all workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Allow community members to view their own workspace" ON community_workspaces;
DROP POLICY IF EXISTS "Community members can update workspace settings" ON community_workspaces;
DROP POLICY IF EXISTS "Community members can view their workspace" ON community_workspaces;

-- Keep these from migration 023 (they are correct):
-- - admins_read_all_workspaces
-- - consultants_read_school_workspaces
-- - members_read_their_workspaces
-- - admins_modify_all_workspaces
-- - community_managers_modify_their_workspace

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'community_workspaces';

  RAISE NOTICE '✅ Cleanup Complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'Total policies remaining: %', policy_count;
  RAISE NOTICE 'Expected: 5 policies (from migration 023)';
  RAISE NOTICE '';

  IF policy_count = 5 THEN
    RAISE NOTICE '✅ CORRECT! Only secure policies remain.';
  ELSIF policy_count > 5 THEN
    RAISE NOTICE '⚠️  WARNING: % policies found, expected 5', policy_count;
    RAISE NOTICE 'Run this to see what remains:';
    RAISE NOTICE 'SELECT policyname FROM pg_policies WHERE tablename = ''community_workspaces'';';
  ELSE
    RAISE NOTICE '❌ ERROR: Only % policies found, expected 5', policy_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Remaining policies should be:';
  RAISE NOTICE '  1. admins_read_all_workspaces';
  RAISE NOTICE '  2. consultants_read_school_workspaces';
  RAISE NOTICE '  3. members_read_their_workspaces';
  RAISE NOTICE '  4. admins_modify_all_workspaces';
  RAISE NOTICE '  5. community_managers_modify_their_workspace';
END $$;
