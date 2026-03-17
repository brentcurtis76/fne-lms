-- ============================================================
-- Migration: Add grade_id FK to school_course_structure
-- Links courses to ab_grades via integer FK instead of text matching.
-- Enables: school_course_structure.grade_id → ab_grades.id ← assessment_templates.grade_id
-- ============================================================

ALTER TABLE school_course_structure
  ADD COLUMN IF NOT EXISTS grade_id INT REFERENCES ab_grades(id);

-- Backfill existing rows by matching grade_level text → ab_grades.sort_order
UPDATE school_course_structure scs
SET grade_id = ag.id
FROM ab_grades ag
WHERE
  (scs.grade_level = 'medio_menor' AND ag.sort_order = 1) OR
  (scs.grade_level = 'medio_mayor' AND ag.sort_order = 2) OR
  (scs.grade_level = 'pre_kinder' AND ag.sort_order = 3) OR
  (scs.grade_level = 'kinder' AND ag.sort_order = 4) OR
  (scs.grade_level = '1_basico' AND ag.sort_order = 5) OR
  (scs.grade_level = '2_basico' AND ag.sort_order = 6) OR
  (scs.grade_level = '3_basico' AND ag.sort_order = 7) OR
  (scs.grade_level = '4_basico' AND ag.sort_order = 8) OR
  (scs.grade_level = '5_basico' AND ag.sort_order = 9) OR
  (scs.grade_level = '6_basico' AND ag.sort_order = 10) OR
  (scs.grade_level = '7_basico' AND ag.sort_order = 11) OR
  (scs.grade_level = '8_basico' AND ag.sort_order = 12) OR
  (scs.grade_level = '1_medio' AND ag.sort_order = 13) OR
  (scs.grade_level = '2_medio' AND ag.sort_order = 14) OR
  (scs.grade_level = '3_medio' AND ag.sort_order = 15) OR
  (scs.grade_level = '4_medio' AND ag.sort_order = 16);
