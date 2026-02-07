-- Debug Eligible Classmates Issue
-- Purpose: Diagnose why "No hay compañeros disponibles para invitar" shows
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Date: 2026-02-05

-- The eligible-classmates API requires:
-- 1. Same school as the requester
-- 2. Enrolled in the same course (active enrollment)
-- 3. Not already in a group for this assignment
-- 4. Not the requester themselves

-- =============================================
-- STEP 1: Get docente.qa's school_id
-- =============================================
SELECT
    '1. DOCENTE.QA SCHOOL' as step,
    p.email,
    ur.role_type,
    ur.school_id,
    s.name as school_name
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN schools s ON s.id = ur.school_id
WHERE p.email = 'docente.qa@fne.cl'
AND ur.is_active = true;

-- =============================================
-- STEP 2: Get the course for the task (block → lesson → course)
-- =============================================
SELECT
    '2. TASK COURSE' as step,
    b.id as block_id,
    b.payload->>'title' as task_title,
    l.id as lesson_id,
    l.title as lesson_title,
    COALESCE(m.course_id, l.course_id) as course_id,
    c.title as course_title
FROM blocks b
JOIN lessons l ON l.id = b.lesson_id
LEFT JOIN modules m ON m.id = l.module_id
JOIN courses c ON c.id = COALESCE(m.course_id, l.course_id)
WHERE (b.type = 'group-assignment' OR b.type = 'group_assignment')
ORDER BY b.id DESC
LIMIT 5;

-- =============================================
-- STEP 3: Check estudiante1.qa's school_id
-- =============================================
SELECT
    '3. ESTUDIANTE1.QA SCHOOL' as step,
    p.email,
    ur.role_type,
    ur.school_id,
    s.name as school_name
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN schools s ON s.id = ur.school_id
WHERE p.email = 'estudiante1.qa@fne.cl'
AND ur.is_active = true;

-- =============================================
-- STEP 4: Check estudiante1.qa's course enrollments
-- =============================================
SELECT
    '4. ESTUDIANTE1.QA ENROLLMENTS' as step,
    p.email,
    ce.course_id,
    c.title as course_title,
    ce.status
FROM profiles p
JOIN course_enrollments ce ON ce.user_id = p.id
JOIN courses c ON c.id = ce.course_id
WHERE p.email = 'estudiante1.qa@fne.cl';

-- =============================================
-- STEP 5: Check if both users are in the SAME course with ACTIVE enrollment
-- =============================================
SELECT
    '5. SHARED COURSE CHECK' as step,
    p1.email as user1,
    p2.email as user2,
    c.title as course_title,
    ce1.status as user1_status,
    ce2.status as user2_status
FROM course_enrollments ce1
JOIN course_enrollments ce2 ON ce2.course_id = ce1.course_id
JOIN profiles p1 ON p1.id = ce1.user_id
JOIN profiles p2 ON p2.id = ce2.user_id
JOIN courses c ON c.id = ce1.course_id
WHERE p1.email = 'docente.qa@fne.cl'
AND p2.email = 'estudiante1.qa@fne.cl'
AND ce1.status = 'active'
AND ce2.status = 'active';

-- =============================================
-- STEP 6: Check if estudiante1.qa is in ANY group for the test task
-- =============================================
SELECT
    '6. ESTUDIANTE1 GROUP MEMBERSHIP' as step,
    p.email,
    gam.assignment_id,
    gam.group_id
FROM group_assignment_members gam
JOIN profiles p ON p.id = gam.user_id
WHERE p.email = 'estudiante1.qa@fne.cl';

-- =============================================
-- FIX: If estudiante1.qa is not enrolled in the same course
-- =============================================

-- First, get the course_id where docente.qa is enrolled
-- Then enroll estudiante1.qa in the same course

/*
-- Get docente.qa's enrolled course
WITH docente_course AS (
    SELECT ce.course_id
    FROM course_enrollments ce
    JOIN profiles p ON p.id = ce.user_id
    WHERE p.email = 'docente.qa@fne.cl'
    AND ce.status = 'active'
    LIMIT 1
)
-- Enroll estudiante1.qa in that course
INSERT INTO course_enrollments (user_id, course_id, status, enrolled_at)
SELECT
    (SELECT id FROM profiles WHERE email = 'estudiante1.qa@fne.cl'),
    dc.course_id,
    'active',
    NOW()
FROM docente_course dc
ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active';
*/

-- =============================================
-- FIX: If estudiante1.qa doesn't have the same school_id
-- =============================================

/*
-- Get docente.qa's school_id
WITH docente_school AS (
    SELECT ur.school_id
    FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.email = 'docente.qa@fne.cl'
    AND ur.is_active = true
    AND ur.school_id IS NOT NULL
    LIMIT 1
)
-- Update estudiante1.qa's user_roles to have the same school
UPDATE user_roles
SET school_id = (SELECT school_id FROM docente_school)
WHERE user_id = (SELECT id FROM profiles WHERE email = 'estudiante1.qa@fne.cl')
AND is_active = true;
*/
