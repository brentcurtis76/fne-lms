-- =============================================================================
-- 099-one-active-docente-index.sql — Procesos de Cambio, Operation A Step 3
--
-- Proves school_course_docente_assignments_one_active_key
-- (20261002180000_one_active_docente_index):
--   [I-0] the index exists, is unique, valid, and has the exact definition;
--   [I-1] a second ACTIVE row for a course is refused (23505), by INSERT and by
--         reactivating an inactive row, and nothing is written;
--   [I-2] inactive rows (history) are unconstrained, for the same and for
--         other docentes;
--   [I-3] different courses each keep their own active docente;
--   [I-4] the replace order (deactivate the old row, then activate / insert the
--         new one, in separate statements) is allowed.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(12);

SELECT tests.create_supabase_user('oa_d1');
SELECT tests.create_supabase_user('oa_d2');
SELECT tests.create_supabase_user('oa_d3');

INSERT INTO public.schools (id, name) VALUES (9990, 'One Active Index School') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES ('99000000-0000-4000-8000-00000000c001', 9990, 60, ARRAY['1_basico'], '{"1_basico": 2}', 1, 'semestral');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
  ('99000000-0000-4000-8000-0000000000a1', 9990, '99000000-0000-4000-8000-00000000c001', '1_basico', '1 BASICO A'),
  ('99000000-0000-4000-8000-0000000000a2', 9990, '99000000-0000-4000-8000-00000000c001', '1_basico', '1 BASICO B');

-- A1: d1 active, d2 inactive (history). A2: d2 active.
INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id, is_active) VALUES
  ('99000000-0000-4000-8000-0000000000d1', '99000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('oa_d1'), true),
  ('99000000-0000-4000-8000-0000000000d2', '99000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('oa_d2'), false),
  ('99000000-0000-4000-8000-0000000000d3', '99000000-0000-4000-8000-0000000000a2', tests.get_supabase_uid('oa_d2'), true);

-- [I-0] -----------------------------------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
            AND indexname = 'school_course_docente_assignments_one_active_key'
            AND indexdef = 'CREATE UNIQUE INDEX school_course_docente_assignments_one_active_key ON public.school_course_docente_assignments USING btree (course_structure_id) WHERE is_active'),
  'I-0: the one-active index exists with the exact definition'
);
SELECT ok(
  (SELECT x.indisunique AND x.indisvalid FROM pg_index x
    WHERE x.indexrelid = 'public.school_course_docente_assignments_one_active_key'::regclass),
  'I-0: the index is unique and valid'
);

-- [I-1] -----------------------------------------------------------------------
SELECT throws_like(
  $$ INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
     VALUES ('99000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('oa_d3'), true) $$,
  '%school_course_docente_assignments_one_active_key%',
  'I-1: a second active docente on a course is refused by the one-active index (insert)'
);
SELECT throws_like(
  $$ UPDATE public.school_course_docente_assignments SET is_active = true
      WHERE id = '99000000-0000-4000-8000-0000000000d2' $$,
  '%school_course_docente_assignments_one_active_key%',
  'I-1: reactivating an inactive row while another is active is refused by the one-active index'
);
SELECT is(
  (SELECT count(*)::int FROM public.school_course_docente_assignments
    WHERE course_structure_id = '99000000-0000-4000-8000-0000000000a1' AND is_active),
  1,
  'I-1: after both refusals the course still has exactly one active docente'
);
SELECT is(
  (SELECT count(*)::int FROM public.school_course_docente_assignments
    WHERE course_structure_id = '99000000-0000-4000-8000-0000000000a1'),
  2,
  'I-1: the refused insert wrote no row'
);

-- [I-2] -----------------------------------------------------------------------
-- (The pre-existing UNIQUE (course_structure_id, docente_id) still allows one
-- row per docente and course; d2's inactive row on A1 is already history.)
SELECT lives_ok(
  $$ INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
     VALUES ('99000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('oa_d3'), false) $$,
  'I-2: a further inactive history row on a course with an active docente is allowed'
);

-- [I-3] -----------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.school_course_docente_assignments
    WHERE course_structure_id = '99000000-0000-4000-8000-0000000000a2' AND is_active),
  1,
  'I-3: another course keeps its own active docente (the same docente may be active on several courses)'
);

-- [I-4] -----------------------------------------------------------------------
SELECT lives_ok(
  $$ UPDATE public.school_course_docente_assignments SET is_active = false
      WHERE id = '99000000-0000-4000-8000-0000000000d1' $$,
  'I-4: deactivating the active row is allowed'
);
SELECT lives_ok(
  $$ UPDATE public.school_course_docente_assignments SET is_active = true
      WHERE id = '99000000-0000-4000-8000-0000000000d2' $$,
  'I-4: then reactivating another docente''s row is allowed'
);
SELECT throws_like(
  $$ UPDATE public.school_course_docente_assignments SET is_active = true
      WHERE id = '99000000-0000-4000-8000-0000000000d1' $$,
  '%school_course_docente_assignments_one_active_key%',
  'I-4: and the previous docente cannot be made active alongside it'
);
SELECT results_eq(
  $$ SELECT id FROM public.school_course_docente_assignments
      WHERE course_structure_id = '99000000-0000-4000-8000-0000000000a1' AND is_active $$,
  $$ VALUES ('99000000-0000-4000-8000-0000000000d2'::uuid) $$,
  'I-4: exactly the replacement row is active'
);

SELECT * FROM finish();
ROLLBACK;
