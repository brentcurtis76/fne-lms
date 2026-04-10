-- DEBUG: Why do some Santa Marta users show "-" and others show "0/8" or "0/6" in TAREAS?
-- This script traces the exact data path the detailed reports API uses.

-- Step 1: Get Santa Marta school ID
WITH school AS (
  SELECT id FROM schools WHERE name ILIKE '%Santa Marta%' LIMIT 1
),

-- Step 2: Get all users from that school (via profiles)
school_users AS (
  SELECT p.id AS user_id, p.first_name, p.last_name, p.email
  FROM profiles p
  JOIN school s ON p.school_id = s.id
  ORDER BY p.last_name, p.first_name
),

-- Step 3: What courses is each user assigned to via course_assignments?
user_courses AS (
  SELECT
    su.user_id,
    su.first_name || ' ' || su.last_name AS name,
    ca.course_id,
    c.title AS course_title
  FROM school_users su
  LEFT JOIN course_assignments ca ON ca.teacher_id = su.user_id
  LEFT JOIN courses c ON c.id = ca.course_id
),

-- Step 4: How many lesson_assignments exist per course?
course_la_counts AS (
  SELECT course_id, COUNT(*) AS la_count
  FROM lesson_assignments
  GROUP BY course_id
),

-- Step 5: Group assignment memberships per user
user_ga_counts AS (
  SELECT user_id, COUNT(DISTINCT assignment_id) AS ga_count
  FROM group_assignment_members
  WHERE user_id IN (SELECT user_id FROM school_users)
  GROUP BY user_id
)

-- Final: Show per-user breakdown
SELECT
  uc.name,
  COUNT(DISTINCT uc.course_id) AS courses_assigned,
  COALESCE(SUM(clac.la_count), 0) AS lesson_assignments_total,
  COALESCE(ugac.ga_count, 0) AS group_assignments_total,
  COALESCE(SUM(clac.la_count), 0) + COALESCE(ugac.ga_count, 0) AS assignments_total,
  STRING_AGG(DISTINCT c2.title, ', ' ORDER BY c2.title) AS course_names
FROM user_courses uc
LEFT JOIN course_la_counts clac ON clac.course_id = uc.course_id
LEFT JOIN user_ga_counts ugac ON ugac.user_id = uc.user_id
LEFT JOIN courses c2 ON c2.id = uc.course_id
GROUP BY uc.user_id, uc.name, ugac.ga_count
ORDER BY uc.name;
