-- Fix Orphaned Group Assignment Data
-- Purpose: Diagnose and fix the "Error al obtener detalles del grupo" issue
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Date: 2026-02-05

-- =============================================
-- DIAGNOSTIC: Check current state
-- =============================================

-- 1. Get docente.qa user ID
SELECT 'DOCENTE.QA USER' as check_type, id, email, first_name, last_name
FROM profiles
WHERE email = 'docente.qa@fne.cl';

-- 2. Check ALL group_assignment_members for docente.qa
SELECT
    'ALL MEMBERSHIPS' as check_type,
    gam.id as membership_id,
    gam.group_id,
    gam.assignment_id,
    gam.user_id,
    gam.role,
    p.email
FROM group_assignment_members gam
JOIN profiles p ON p.id = gam.user_id
WHERE p.email = 'docente.qa@fne.cl';

-- 3. Check ALL group_assignment_groups
SELECT
    'ALL GROUPS' as check_type,
    gag.id as group_id,
    gag.name,
    gag.assignment_id,
    gag.community_id,
    gag.created_at
FROM group_assignment_groups gag
ORDER BY gag.created_at DESC
LIMIT 10;

-- 4. Check if the group_id from membership exists in groups table
SELECT
    'ORPHAN CHECK' as check_type,
    gam.group_id,
    gam.assignment_id,
    CASE WHEN gag.id IS NULL THEN 'ORPHAN - Group does not exist!' ELSE 'OK' END as status
FROM group_assignment_members gam
JOIN profiles p ON p.id = gam.user_id
LEFT JOIN group_assignment_groups gag ON gag.id = gam.group_id
WHERE p.email = 'docente.qa@fne.cl';

-- 5. Check what blocks (tasks) exist for the enrolled course
SELECT
    'AVAILABLE TASKS' as check_type,
    b.id as block_id,
    b.type,
    b.payload->>'title' as task_title,
    l.title as lesson_title,
    c.title as course_title
FROM blocks b
JOIN lessons l ON l.id = b.lesson_id
LEFT JOIN modules m ON m.id = l.module_id
JOIN courses c ON c.id = COALESCE(m.course_id, l.course_id)
JOIN course_enrollments ce ON ce.course_id = c.id
JOIN profiles p ON p.id = ce.user_id
WHERE p.email = 'docente.qa@fne.cl'
AND ce.status = 'active'
AND (b.type = 'group-assignment' OR b.type = 'group_assignment');

-- =============================================
-- FIX: Delete orphaned membership records
-- =============================================

-- Option A: Delete ALL membership records for docente.qa (clean slate)
-- Uncomment to run:
/*
DELETE FROM group_assignment_members
WHERE user_id = (SELECT id FROM profiles WHERE email = 'docente.qa@fne.cl');
*/

-- Option B: Delete only orphaned records (group doesn't exist)
-- Uncomment to run:
/*
DELETE FROM group_assignment_members
WHERE user_id = (SELECT id FROM profiles WHERE email = 'docente.qa@fne.cl')
AND group_id NOT IN (SELECT id FROM group_assignment_groups);
*/

-- Option C: Delete membership for specific assignment
-- Replace <ASSIGNMENT_ID> with the actual block ID
-- Uncomment to run:
/*
DELETE FROM group_assignment_members
WHERE user_id = (SELECT id FROM profiles WHERE email = 'docente.qa@fne.cl')
AND assignment_id = '<ASSIGNMENT_ID>';
*/

-- =============================================
-- VERIFICATION: After cleanup
-- =============================================

-- Run this after cleanup to verify:
/*
SELECT
    'AFTER CLEANUP' as check_type,
    COUNT(*) as membership_count
FROM group_assignment_members gam
JOIN profiles p ON p.id = gam.user_id
WHERE p.email = 'docente.qa@fne.cl';
*/
