-- Cleanup ALL Orphaned Group Memberships
-- Purpose: Remove membership records that point to non-existent groups
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Date: 2026-02-05

-- =============================================
-- DIAGNOSTIC: Show all orphaned memberships
-- =============================================
SELECT
    'ORPHANED MEMBERSHIPS' as check_type,
    gam.id,
    gam.group_id,
    gam.assignment_id,
    gam.user_id,
    p.email,
    CASE WHEN gag.id IS NULL THEN 'ORPHAN - Group does not exist' ELSE 'OK' END as status
FROM group_assignment_members gam
JOIN profiles p ON p.id = gam.user_id
LEFT JOIN group_assignment_groups gag ON gag.id = gam.group_id;

-- =============================================
-- FIX: Delete ALL orphaned membership records
-- (memberships where the group no longer exists)
-- =============================================

DELETE FROM group_assignment_members
WHERE group_id NOT IN (SELECT id FROM group_assignment_groups);

-- =============================================
-- VERIFICATION: Confirm cleanup
-- =============================================
SELECT
    'AFTER CLEANUP' as check_type,
    COUNT(*) as remaining_memberships
FROM group_assignment_members gam
LEFT JOIN group_assignment_groups gag ON gag.id = gam.group_id
WHERE gag.id IS NULL;

-- Should return 0 remaining orphaned memberships
