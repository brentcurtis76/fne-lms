-- =============================================================================
-- 108-transformation-school-scope.sql — migration
-- 20261009120000_transformation_school_scope.sql: vías de transformación
-- staff access is scoped to the school.
--
--   [S-0] transformation_school_staff: SECURITY DEFINER, pinned search_path,
--         PUBLIC holds no EXECUTE; anon / authenticated / service_role may
--         (policy predicate); actor-bound (a foreign id answers false); no
--         transformation_* policy still grants global staff access.
--   [S-1] consultor assigned to school A only: reads / updates / collaborates
--         on A; for school B reads nothing (assessment, collaborators,
--         messages, results), updates and deletes nothing, cannot insert an
--         assessment or a collaborator. An inactive assignment counts for
--         nothing.
--   [S-2] consultor with no assignment: reads nothing.
--   [S-3] equipo_directivo of B (is_admin_or_consultor counts directivos):
--         reads B through membership, nothing of A.
--   [S-4] admin: every school, including a row without a school.
--   [S-5] unchanged: a docente of A reads A by membership and nothing of B;
--         a growth-community member reads the community's messages.
--   [S-6] unchanged, each right on its own (Codex F1 r3 note): a plain school
--         member reads but cannot update; a community member (no school
--         role) reads, updates and inserts when the community has
--         transformation access; an editable collaborator from another
--         school reads, updates and removes only their own row.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(56);

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.rows_affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('ts_admin');
SELECT tests.create_supabase_user('ts_cons');      -- consultor, active assignment A, inactive B
SELECT tests.create_supabase_user('ts_cons_none'); -- consultor, no assignment
SELECT tests.create_supabase_user('ts_dir_b');     -- equipo_directivo, school B
SELECT tests.create_supabase_user('ts_doc_a');     -- docente, school A, community GA
SELECT tests.create_supabase_user('ts_mem_a');     -- docente, school A only (no community, not creator / collaborator)
SELECT tests.create_supabase_user('ts_comm_a');    -- docente, community GA only (no school on the role)
SELECT tests.create_supabase_user('ts_collab_a');  -- docente of school B, editable collaborator on A

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('ts_admin'), ('ts_cons'), ('ts_cons_none'), ('ts_dir_b'), ('ts_doc_a'), ('ts_mem_a'), ('ts_comm_a'), ('ts_collab_a')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9811, 'TS school A (pgTAP 108)'), (9812, 'TS school B (pgTAP 108)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('10800000-0000-4000-8000-00000000c00a', 9811, 'TS community A'),
  ('10800000-0000-4000-8000-00000000c00b', 9812, 'TS community B');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('ts_admin'),     'admin',            NULL, NULL, true),
  (pg_temp.uid('ts_cons'),      'consultor',        NULL, NULL, true),
  (pg_temp.uid('ts_cons_none'), 'consultor',        NULL, NULL, true),
  (pg_temp.uid('ts_dir_b'),     'equipo_directivo', 9812, NULL, true),
  (pg_temp.uid('ts_doc_a'),     'docente',          9811, '10800000-0000-4000-8000-00000000c00a', true),
  (pg_temp.uid('ts_mem_a'),     'docente',          9811, NULL, true),
  (pg_temp.uid('ts_comm_a'),    'docente',          NULL, '10800000-0000-4000-8000-00000000c00a', true),
  (pg_temp.uid('ts_collab_a'),  'docente',          9812, NULL, true);

INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active) VALUES
  (pg_temp.uid('ts_cons'), 9811, true),
  (pg_temp.uid('ts_cons'), 9812, false);

INSERT INTO public.transformation_rubric (id, area, objective_number, objective_text, action_number, action_text, dimension,
  level_1_descriptor, level_2_descriptor, level_3_descriptor, level_4_descriptor, initial_questions, display_order)
VALUES ('10800000-0000-4000-8000-0000000000f1', 'evaluacion', 1, 'o', 1, 'a', 'cobertura', '1', '2', '3', '4', ARRAY['q'], 1);

INSERT INTO public.transformation_assessments (id, growth_community_id, area, school_id, created_by) VALUES
  ('10800000-0000-4000-8000-0000000000a1', '10800000-0000-4000-8000-00000000c00a', 'evaluacion', 9811, pg_temp.uid('ts_doc_a')),
  ('10800000-0000-4000-8000-0000000000b1', '10800000-0000-4000-8000-00000000c00b', 'evaluacion', 9812, NULL),
  ('10800000-0000-4000-8000-0000000000c1', NULL, 'evaluacion', NULL, NULL);
INSERT INTO public.transformation_assessment_collaborators (assessment_id, user_id, can_edit) VALUES
  ('10800000-0000-4000-8000-0000000000a1', pg_temp.uid('ts_doc_a'), true),
  ('10800000-0000-4000-8000-0000000000b1', pg_temp.uid('ts_dir_b'), true),
  ('10800000-0000-4000-8000-0000000000a1', pg_temp.uid('ts_collab_a'), true);
-- Community A has transformation access (the members_* write branches).
UPDATE public.growth_communities SET transformation_enabled = true WHERE id = '10800000-0000-4000-8000-00000000c00a';
INSERT INTO public.transformation_conversation_messages (assessment_id, rubric_item_id, role, content) VALUES
  ('10800000-0000-4000-8000-0000000000a1', '10800000-0000-4000-8000-0000000000f1', 'user', 'A'),
  ('10800000-0000-4000-8000-0000000000b1', '10800000-0000-4000-8000-0000000000f1', 'user', 'B');
INSERT INTO public.transformation_results (assessment_id, rubric_item_id, determined_level) VALUES
  ('10800000-0000-4000-8000-0000000000a1', '10800000-0000-4000-8000-0000000000f1', 2),
  ('10800000-0000-4000-8000-0000000000b1', '10800000-0000-4000-8000-0000000000f1', 3);

-- =============================================================================
-- [S-0] The helper and the policy inventory
-- =============================================================================
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.transformation_school_staff(uuid, integer)'::regprocedure),
  'S-0: transformation_school_staff is SECURITY DEFINER');
SELECT ok(EXISTS (SELECT 1 FROM unnest((SELECT proconfig FROM pg_proc WHERE oid = 'public.transformation_school_staff(uuid, integer)'::regprocedure)) c
                   WHERE c = 'search_path=public, pg_temp'), 'S-0: search_path pinned to public, pg_temp');
SELECT ok(NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = 'public.transformation_school_staff(uuid, integer)'::regprocedure)) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 'S-0: PUBLIC holds no EXECUTE');
SELECT ok(has_function_privilege('anon', 'public.transformation_school_staff(uuid, integer)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.transformation_school_staff(uuid, integer)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.transformation_school_staff(uuid, integer)', 'EXECUTE'),
  'S-0: anon, authenticated and service_role may EXECUTE (policy predicate)');
SELECT is((SELECT count(*)::int FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('transformation_assessments', 'transformation_assessment_collaborators',
                                                          'transformation_conversation_messages', 'transformation_results')
              AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_admin_or_consultor|''consultor''::user_role_type)'
              -- community-scoped already: the admin/consultor role row must
              -- belong to the assessment's own growth community (join on it)
              AND policyname <> 'members_delete_transformation_results'),
  0, 'S-0: no vías policy grants global staff access any more');
SELECT is((SELECT count(*)::int FROM pg_policies p
            WHERE (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'transformation_school_staff\((?!auth\.uid\(\))'),
  0, 'S-0: every policy passes auth.uid() to transformation_school_staff');
SELECT is((SELECT count(*)::int FROM pg_policies p
            WHERE (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'transformation_school_staff\('),
  12, 'S-0: the twelve rewritten policies use the scoped predicate');

-- =============================================================================
-- [S-1] consultor assigned to A only
-- =============================================================================
SELECT tests.authenticate_as('ts_cons');
SELECT ok(public.transformation_school_staff(auth.uid(), 9811), 'S-1: staff for the assigned school');
SELECT ok(NOT public.transformation_school_staff(auth.uid(), 9812), 'S-1: not staff for a school with only an inactive assignment');
SELECT ok(NOT public.transformation_school_staff(auth.uid(), NULL), 'S-1: not staff for a row without a school');
SELECT ok(NOT public.transformation_school_staff(pg_temp.uid('ts_admin'), 9812), 'S-1: asking about the admin answers false (actor-bound)');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-1: reads the assigned school''s assessment');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id IN ('10800000-0000-4000-8000-0000000000b1', '10800000-0000-4000-8000-0000000000c1')), 0, 'S-1: reads nothing of school B nor the school-less row');
SELECT is((SELECT count(*)::int FROM public.transformation_assessment_collaborators WHERE assessment_id = '10800000-0000-4000-8000-0000000000b1'), 0, 'S-1: reads no collaborator of B');
SELECT is((SELECT count(*)::int FROM public.transformation_conversation_messages WHERE assessment_id = '10800000-0000-4000-8000-0000000000b1'), 0, 'S-1: reads no conversation message of B');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id = '10800000-0000-4000-8000-0000000000b1'), 0, 'S-1: reads no result of B');
SELECT is((SELECT count(*)::int FROM public.transformation_conversation_messages WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-1: reads A''s conversation');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-1: reads A''s results');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":1}' WHERE id = '10800000-0000-4000-8000-0000000000b1'$$), 0, 'S-1: updates nothing of B');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000b1'$$), 0, 'S-1: deletes nothing of B');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.transformation_assessment_collaborators WHERE assessment_id = '10800000-0000-4000-8000-0000000000b1'$$), 0, 'S-1: removes no collaborator of B');
SELECT throws_ok($$INSERT INTO public.transformation_assessments (growth_community_id, area, school_id, created_by) VALUES ('10800000-0000-4000-8000-00000000c00b', 'evaluacion', 9812, auth.uid())$$,
  '42501', NULL, 'S-1: cannot create an assessment for B');
SELECT throws_ok($$INSERT INTO public.transformation_assessment_collaborators (assessment_id, user_id, can_edit) VALUES ('10800000-0000-4000-8000-0000000000b1', auth.uid(), true)$$,
  '42501', NULL, 'S-1: cannot add a collaborator to B');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":1}' WHERE id = '10800000-0000-4000-8000-0000000000a1'$$), 1, 'S-1: updates A');
SELECT lives_ok($$INSERT INTO public.transformation_assessments (growth_community_id, area, school_id, created_by) VALUES ('10800000-0000-4000-8000-00000000c00a', 'aprendizaje', 9811, auth.uid())$$,
  'S-1: may create an assessment for A');
SELECT lives_ok($$INSERT INTO public.transformation_assessment_collaborators (assessment_id, user_id, can_edit) VALUES ('10800000-0000-4000-8000-0000000000a1', pg_temp.uid('ts_cons'), true)$$,
  'S-1: may add a collaborator to A');
RESET ROLE;

-- =============================================================================
-- [S-2] consultor without an assignment
-- =============================================================================
SELECT tests.authenticate_as('ts_cons_none');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id::text LIKE '10800000-%'), 0, 'S-2: reads no assessment');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id::text LIKE '10800000-%'), 0, 'S-2: reads no result');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":2}' WHERE id::text LIKE '10800000-%'$$), 0, 'S-2: updates nothing');
RESET ROLE;

-- =============================================================================
-- [S-3] equipo_directivo of B
-- =============================================================================
SELECT tests.authenticate_as('ts_dir_b');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000b1'), 1, 'S-3: reads B (membership)');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id IN ('10800000-0000-4000-8000-0000000000a1', '10800000-0000-4000-8000-0000000000c1')), 0, 'S-3: reads nothing of A nor the school-less row');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 0, 'S-3: reads no result of A');
SELECT is((SELECT count(*)::int FROM public.transformation_conversation_messages WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 0, 'S-3: reads no conversation of A');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":3}' WHERE id = '10800000-0000-4000-8000-0000000000a1'$$), 0, 'S-3: updates nothing of A');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":3}' WHERE id = '10800000-0000-4000-8000-0000000000b1'$$), 1, 'S-3: updates B as its collaborator');
SELECT throws_ok($$INSERT INTO public.transformation_assessments (growth_community_id, area, school_id, created_by) VALUES ('10800000-0000-4000-8000-00000000c00a', 'evaluacion', 9811, auth.uid())$$,
  '42501', NULL, 'S-3: cannot create an assessment for A');
RESET ROLE;

-- =============================================================================
-- [S-4] admin
-- =============================================================================
SELECT tests.authenticate_as('ts_admin');
SELECT ok(public.transformation_school_staff(auth.uid(), 9812) AND public.transformation_school_staff(auth.uid(), NULL), 'S-4: admin is staff everywhere, also without a school');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id IN ('10800000-0000-4000-8000-0000000000a1', '10800000-0000-4000-8000-0000000000b1', '10800000-0000-4000-8000-0000000000c1')), 3, 'S-4: reads every school and the school-less row');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id::text LIKE '10800000-%'), 2, 'S-4: reads every result');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":4}' WHERE id = '10800000-0000-4000-8000-0000000000b1'$$), 1, 'S-4: updates B');
RESET ROLE;

-- =============================================================================
-- [S-5] unchanged member rights
-- =============================================================================
SELECT tests.authenticate_as('ts_doc_a');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-5: docente of A reads A');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000b1'), 0, 'S-5: docente of A reads nothing of B');
SELECT is((SELECT count(*)::int FROM public.transformation_conversation_messages WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-5: community member reads A''s conversation');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.transformation_assessment_collaborators WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1' AND user_id = auth.uid()$$), 1, 'S-5: a collaborator may remove themself');
RESET ROLE;

-- =============================================================================
-- [S-6] each preserved right on its own
-- =============================================================================
SELECT tests.authenticate_as('ts_mem_a');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-6: a plain school member reads A');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":6}' WHERE id = '10800000-0000-4000-8000-0000000000a1'$$), 0, 'S-6: a plain school member cannot update A');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 0, 'S-6: a plain school member reads no result (results are community-scoped)');
RESET ROLE;
SELECT tests.authenticate_as('ts_comm_a');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-6: a community member reads the community''s assessment');
SELECT is((SELECT count(*)::int FROM public.transformation_results WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-6: a community member reads its results');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET context_metadata = '{"x":7}' WHERE id = '10800000-0000-4000-8000-0000000000a1'$$), 1, 'S-6: a community member updates it (transformation access on)');
SELECT lives_ok($$INSERT INTO public.transformation_assessments (growth_community_id, area, school_id, created_by) VALUES ('10800000-0000-4000-8000-00000000c00a', 'personalizacion', 9811, auth.uid())$$,
  'S-6: a community member may create one for the community');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000b1'), 0, 'S-6: a community member reads nothing of another community');
RESET ROLE;
SELECT tests.authenticate_as('ts_collab_a');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '10800000-0000-4000-8000-0000000000a1'), 1, 'S-6: an editable collaborator from another school reads A');
-- Unchanged from before this migration: the update WITH CHECK keeps a
-- school row writable only by its school's members (or staff), so an editable
-- collaborator from ANOTHER school sees the row but cannot write it.
SELECT throws_ok($$UPDATE public.transformation_assessments SET context_metadata = '{"x":8}' WHERE id = '10800000-0000-4000-8000-0000000000a1'$$,
  '42501', NULL, 'S-6: an editable collaborator from another school cannot write A (WITH CHECK, unchanged)');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.transformation_assessment_collaborators WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1' AND user_id <> auth.uid()$$), 0, 'S-6: a collaborator cannot remove someone else');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.transformation_assessment_collaborators WHERE assessment_id = '10800000-0000-4000-8000-0000000000a1' AND user_id = auth.uid()$$), 1, 'S-6: a collaborator removes their own row');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
