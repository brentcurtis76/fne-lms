/**
 * Migration 028: Add UNIQUE constraint to group_assignment_groups
 *
 * Purpose: Enforce exactly one group per (assignment_id, community_id) pair
 *
 * Changes:
 * 1. Add UNIQUE constraint on (assignment_id, community_id)
 *
 * PREREQUISITES:
 * - MUST run scripts/check-duplicate-group-assignments.js first
 * - If duplicates found, manually clean up before running this migration
 * - Migration will FAIL with constraint violation if duplicates exist
 *
 * Context:
 * This constraint is required for Phase 1 auto-provisioning to work correctly.
 * Without it, multiple groups could exist for the same (assignment, community)
 * pair, causing the backfill script to fail.
 *
 * Usage:
 *   # Step 1: Check for duplicates
 *   node scripts/check-duplicate-group-assignments.js
 *
 *   # Step 2: If no duplicates, apply migration
 *   psql $DATABASE_URL -f database/migrations/028_add_group_unique_constraint.sql
 *
 * Rollback:
 *   ALTER TABLE group_assignment_groups DROP CONSTRAINT IF EXISTS unique_assignment_community;
 */

-- ============================================================================
-- Add UNIQUE constraint
-- ============================================================================

-- This constraint ensures that each (assignment_id, community_id) pair
-- can only have ONE group record. This is critical for auto-provisioning
-- logic to work correctly.

ALTER TABLE group_assignment_groups
ADD CONSTRAINT unique_assignment_community
UNIQUE (assignment_id, community_id);

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify the constraint was created
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'group_assignment_groups'::regclass
  AND conname = 'unique_assignment_community';

-- Expected output:
--   constraint_name            | constraint_definition
--   ---------------------------+-----------------------------------------------
--   unique_assignment_community | UNIQUE (assignment_id, community_id)

-- ============================================================================
-- Test Queries (optional - run manually)
-- ============================================================================

-- Test 1: Inserting a new group (should succeed)
-- INSERT INTO group_assignment_groups (assignment_id, community_id, name)
-- VALUES ('test-assignment-1', 'test-community-1', 'Test Group 1');

-- Test 2: Inserting duplicate (assignment_id, community_id) - should FAIL
-- INSERT INTO group_assignment_groups (assignment_id, community_id, name)
-- VALUES ('test-assignment-1', 'test-community-1', 'Test Group 2');
-- Expected error: duplicate key value violates unique constraint "unique_assignment_community"

-- Test 3: Inserting same assignment but different community (should succeed)
-- INSERT INTO group_assignment_groups (assignment_id, community_id, name)
-- VALUES ('test-assignment-1', 'test-community-2', 'Test Group 3');

-- Clean up test data:
-- DELETE FROM group_assignment_groups WHERE assignment_id LIKE 'test-assignment-%';

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 028 completed successfully';
  RAISE NOTICE '   UNIQUE constraint added: (assignment_id, community_id)';
  RAISE NOTICE '   Table: group_assignment_groups';
  RAISE NOTICE '   Next step: Run backfill script (Phase 1)';
  RAISE NOTICE '   Command: node scripts/backfill-group-memberships.js --dry-run';
END $$;
