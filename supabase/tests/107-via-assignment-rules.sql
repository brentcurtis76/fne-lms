-- =============================================================================
-- 107-via-assignment-rules.sql — registros assigned by vía
-- (20261008120000_via_assignment_rules)
--
--   [V-0] objects, RLS, grants: tables RLS-enabled with no write grants; the
--         RPCs are SECURITY INVOKER and service_role-only; lock_via_rule is
--         service_role-only; set_via_assignment_rule is granted to nobody.
--   [V-1] template guard: a live template must fit its vía's rule; drafts,
--         archived templates and unrelated edits are not checked; a vía with
--         no rule can never go live.
--   [V-2] set_via_assignment_rule: Crecimiento is locked; a vía with a
--         published template (archived included) or an instance is refused;
--         a clean vía changes.
--   [V-3] assign: actor / candidate / context checks; instance + link + grant
--         per eligible template; re-send is idempotent; a different person is
--         refused; an unlinked school-level instance is never touched; an
--         archived template is skipped.
--   [V-4] replace: untouched registros move (only the old person's grant,
--         co-assignees stay); each kind of "touched" refuses the whole
--         replace and writes nothing; successive replacements work.
--   [V-5] a cancelled linked registro is reported, never recreated.
--   [V-6] the course RPC refuses a template of a school-level vía.
--   [V-7] response saves on linked instances: an assignee may write, a
--         removed one is refused; course instances are unaffected.
--   [V-8] the RPCs work under the real service_role grants while a direct
--         rule UPDATE is refused.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(73);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('vr_admin');
SELECT tests.create_supabase_user('vr_dir1');    -- equipo_directivo, school 9107
SELECT tests.create_supabase_user('vr_dir2');    -- equipo_directivo, school 9107
SELECT tests.create_supabase_user('vr_dir3');    -- equipo_directivo, school 9107
SELECT tests.create_supabase_user('vr_dirx');    -- equipo_directivo, OTHER school 9108
SELECT tests.create_supabase_user('vr_doc');     -- docente, school 9107
SELECT tests.create_supabase_user('vr_co');      -- unrelated co-assignee

SELECT tests.get_supabase_uid('vr_admin') AS admin \gset
SELECT tests.get_supabase_uid('vr_dir1') AS dir1 \gset
SELECT tests.get_supabase_uid('vr_dir2') AS dir2 \gset
SELECT tests.get_supabase_uid('vr_dir3') AS dir3 \gset
SELECT tests.get_supabase_uid('vr_dirx') AS dirx \gset
SELECT tests.get_supabase_uid('vr_doc') AS doc \gset
SELECT tests.get_supabase_uid('vr_co') AS co \gset

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('vr_admin'), ('vr_dir1'), ('vr_dir2'), ('vr_dir3'), ('vr_dirx'), ('vr_doc'), ('vr_co')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9107, 'Via Rules School'), (9108, 'Via Rules Other School'), (9109, 'Via Rules No Context School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (:'admin', 'admin',            NULL, true),
  (:'dir1',  'equipo_directivo', 9107, true),
  (:'dir2',  'equipo_directivo', 9107, true),
  (:'dir3',  'equipo_directivo', 9107, true),
  (:'dir1',  'equipo_directivo', 9109, true),
  (:'dirx',  'equipo_directivo', 9108, true),
  (:'doc',   'docente',          9107, true);

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES ('10700000-0000-4000-8000-00000000c0a1', 9107, 100, ARRAY['1_basico'], '{"1_basico": 1}', 2, 'semestral');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
  ('10700000-0000-4000-8000-0000000000a1', 9107, '10700000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO A');
INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active) VALUES
  ('10700000-0000-4000-8000-0000000000a1', :'doc', true);

INSERT INTO public.ab_grades (id, name, sort_order) VALUES (91071, 'Grade 107', 91071);

-- t1, t2: published Liderazgo (grade-less); t3: archived Liderazgo; t4: draft
-- Propósito with a (legacy) grade; tc: published Crecimiento with grade.
INSERT INTO public.assessment_templates (id, area, version, name, status, is_archived, grade_id) VALUES
  ('10700000-0000-4000-8000-0000000000e1', 'liderazgo',       '1.0', 'LID Equipo',  'published', false, NULL),
  ('10700000-0000-4000-8000-0000000000e2', 'liderazgo',       '1.0', 'LID Base',    'published', false, NULL),
  ('10700000-0000-4000-8000-0000000000e3', 'liderazgo',       '1.0', 'LID Old',     'published', true,  NULL),
  ('10700000-0000-4000-8000-0000000000e4', 'proposito',       '1.0', 'PRO Draft',   'draft',     false, 91071),
  ('10700000-0000-4000-8000-0000000000ec', 'personalizacion', '1.0', 'CRE 107',     'published', false, 91071);

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data, created_at) VALUES
  ('10700000-0000-4000-8000-0000000000f1', '10700000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z'),
  ('10700000-0000-4000-8000-0000000000f9', '10700000-0000-4000-8000-0000000000e1', '1.1', '{"modules": []}', '2026-02-01T00:00:00Z'),
  ('10700000-0000-4000-8000-0000000000f2', '10700000-0000-4000-8000-0000000000e2', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z'),
  ('10700000-0000-4000-8000-0000000000f3', '10700000-0000-4000-8000-0000000000e3', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z'),
  ('10700000-0000-4000-8000-0000000000fc', '10700000-0000-4000-8000-0000000000ec', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z');

-- A pre-existing school-level instance (no link) with an answer-holder grant.
INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, transformation_year, status, generation_type) VALUES
  ('10700000-0000-4000-8000-00000000aa01', '10700000-0000-4000-8000-0000000000f2', 9107, 1, 'pending', 'GT');
INSERT INTO public.assessment_instance_assignees (instance_id, user_id) VALUES
  ('10700000-0000-4000-8000-00000000aa01', :'co');

CREATE FUNCTION pg_temp.legacy() RETURNS text LANGUAGE sql AS $$
  SELECT i.status || ':' || i.template_snapshot_id || ':' ||
         coalesce((SELECT string_agg(user_id::text, ',' ORDER BY user_id) FROM public.assessment_instance_assignees
                    WHERE instance_id = i.id), '')
    FROM public.assessment_instances i WHERE i.id = '10700000-0000-4000-8000-00000000aa01'
$$;
CREATE TEMP TABLE vr_legacy AS SELECT pg_temp.legacy() AS s;

-- Fingerprint of everything this flow writes for school 9107.
CREATE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg(user_id || ':' || area || ':' || is_active, ',' ORDER BY assigned_at, id)
                     FROM public.school_via_responsibles WHERE school_id = 9107), '')
      || '|' ||
         coalesce((SELECT string_agg(l.template_id || ':' || i.status || ':' ||
                                     coalesce((SELECT string_agg(a.user_id::text, ',' ORDER BY a.user_id)
                                                 FROM public.assessment_instance_assignees a WHERE a.instance_id = i.id), ''),
                                     ';' ORDER BY l.template_id)
                     FROM public.school_via_instance_links l JOIN public.assessment_instances i ON i.id = l.instance_id
                    WHERE l.school_id = 9107), '')
$$;

CREATE FUNCTION pg_temp.inst(tpl text) RETURNS uuid LANGUAGE sql AS $$
  SELECT instance_id FROM public.school_via_instance_links
   WHERE school_id = 9107 AND template_id = ('10700000-0000-4000-8000-0000000000' || tpl)::uuid
$$;

-- =============================================================================
-- [V-0] Objects, RLS, grants
-- =============================================================================
SELECT tests.rls_enabled('public', 'ab_via_assignment_rules');
SELECT tests.rls_enabled('public', 'school_via_responsibles');
SELECT tests.rls_enabled('public', 'school_via_instance_links');
SELECT table_privs_are('public', 'ab_via_assignment_rules', 'authenticated', ARRAY['SELECT'], 'V-0: authenticated may only read rules');
SELECT table_privs_are('public', 'ab_via_assignment_rules', 'service_role', ARRAY['SELECT'], 'V-0: service_role may only read rules');
SELECT table_privs_are('public', 'school_via_responsibles', 'authenticated', ARRAY['SELECT'], 'V-0: authenticated may only read responsibles');
SELECT table_privs_are('public', 'school_via_instance_links', 'authenticated', ARRAY[]::text[], 'V-0: authenticated holds nothing on links');
SELECT table_privs_are('public', 'school_via_responsibles', 'service_role', ARRAY['INSERT','SELECT','UPDATE'], 'V-0: service_role writes responsibles only through the RPCs (no DELETE)');
SELECT table_privs_are('public', 'school_via_instance_links', 'anon', ARRAY[]::text[], 'V-0: anon holds nothing on links');
SELECT function_privs_are('public', 'assign_school_via_responsible', ARRAY['integer','text','uuid','uuid'], 'authenticated', ARRAY[]::text[], 'V-0: authenticated cannot assign');
SELECT function_privs_are('public', 'assign_school_via_responsible', ARRAY['integer','text','uuid','uuid'], 'service_role', ARRAY['EXECUTE'], 'V-0: service_role may assign');
SELECT function_privs_are('public', 'replace_school_via_responsible', ARRAY['integer','text','uuid','uuid'], 'authenticated', ARRAY[]::text[], 'V-0: authenticated cannot replace');
SELECT function_privs_are('public', 'lock_via_rule', ARRAY['text'], 'authenticated', ARRAY[]::text[], 'V-0: authenticated cannot lock rules');
SELECT function_privs_are('public', 'set_via_assignment_rule', ARRAY['text','text'], 'service_role', ARRAY[]::text[], 'V-0: service_role cannot change rules');
SELECT is((SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE proname IN ('assign_school_via_responsible', 'replace_school_via_responsible', 'school_via_attach', 'school_via_check')),
          true, 'V-0: the school-vía RPCs are SECURITY INVOKER');
SELECT is((SELECT target FROM public.ab_via_assignment_rules WHERE area = 'personalizacion'), 'course_docente', 'V-0: Crecimiento is course_docente');
SELECT is((SELECT string_agg(area, ',' ORDER BY area) FROM public.ab_via_assignment_rules WHERE target = 'school_responsible'),
          'liderazgo,proposito', 'V-0: Liderazgo and Propósito are school_responsible');

-- =============================================================================
-- [V-1] Template guard
-- =============================================================================
SELECT throws_ok($$ UPDATE public.assessment_templates SET status = 'published' WHERE id = '10700000-0000-4000-8000-0000000000e4' $$,
  'P0001', 'template_grade_not_allowed', 'V-1: a graded template cannot go live in a school vía');
SELECT throws_ok($$ INSERT INTO public.assessment_templates (area, version, name, status) VALUES ('personalizacion', '9.0', 'CRE no grade', 'published') $$,
  'P0001', 'template_grade_required', 'V-1: a grade-less template cannot go live in a course vía');
SELECT throws_ok($$ INSERT INTO public.assessment_templates (area, version, name, status) VALUES ('lenguaje', '9.0', 'Unknown via', 'published') $$,
  'P0001', 'via_rule_missing', 'V-1: a vía with no rule can never go live');
SELECT lives_ok($$ UPDATE public.assessment_templates SET name = 'PRO Draft edited' WHERE id = '10700000-0000-4000-8000-0000000000e4' $$,
  'V-1: editing a legacy draft without touching guarded columns is allowed');
SELECT lives_ok($$ UPDATE public.assessment_templates SET is_archived = true WHERE id = '10700000-0000-4000-8000-0000000000ec' $$,
  'V-1: archiving is always allowed');
SELECT lives_ok($$ UPDATE public.assessment_templates SET is_archived = false WHERE id = '10700000-0000-4000-8000-0000000000ec' $$,
  'V-1: restoring a fitting template is allowed');
SELECT throws_ok($$ UPDATE public.assessment_templates SET grade_id = NULL WHERE id = '10700000-0000-4000-8000-0000000000ec' $$,
  'P0001', 'template_grade_required', 'V-1: a live course template cannot lose its grade');

-- =============================================================================
-- [V-2] Rule changes
-- =============================================================================
SELECT throws_ok($$ SELECT public.set_via_assignment_rule('personalizacion', 'school_responsible') $$,
  'P0001', 'via_rule_locked', 'V-2: Crecimiento is locked');
SELECT throws_ok($$ SELECT public.set_via_assignment_rule('liderazgo', 'course_docente') $$,
  'P0001', 'via_rule_has_published_templates', 'V-2: a vía with published templates is refused');
-- a vía whose only published template is archived is still refused
INSERT INTO public.assessment_templates (area, version, name, status, is_archived, grade_id)
VALUES ('trabajo_docente', '1.0', 'TDO archived', 'published', true, 91071);
SELECT throws_ok($$ SELECT public.set_via_assignment_rule('trabajo_docente', 'school_responsible') $$,
  'P0001', 'via_rule_has_published_templates', 'V-2: an archived published template also blocks a change');
SELECT lives_ok($$ SELECT public.set_via_assignment_rule('familias', 'school_responsible') $$,
  'V-2: a clean vía changes');
SELECT is((SELECT target FROM public.ab_via_assignment_rules WHERE area = 'familias'), 'school_responsible', 'V-2: the change is stored');

-- =============================================================================
-- [V-3] Assign
-- =============================================================================
SELECT throws_ok(format($$ SELECT public.assign_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'doc', :'admin'),
  'P0001', 'responsible_not_eligible', 'V-3: a docente cannot be the responsible');
SELECT throws_ok(format($$ SELECT public.assign_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dirx', :'admin'),
  'P0001', 'responsible_not_eligible', 'V-3: a directivo of another school cannot be the responsible');
SELECT throws_ok(format($$ SELECT public.assign_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'dirx'),
  '42501', 'permission_denied', 'V-3: a directivo of another school cannot assign');
SELECT throws_ok(format($$ SELECT public.assign_school_via_responsible(9107, 'personalizacion', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'via_not_school_level', 'V-3: a course vía cannot be assigned here');
SELECT throws_ok(format($$ SELECT public.assign_school_via_responsible(9109, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'context_missing', 'V-3: a school without context is refused');
SELECT is(pg_temp.state(), '|', 'V-3: the refusals wrote nothing');

SELECT is(
  (SELECT string_agg(d->>'outcome', ',' ORDER BY d->>'template_name')
     FROM jsonb_array_elements(public.assign_school_via_responsible(9107, 'liderazgo', :'dir1', :'dir2')->'details') d),
  'created,created', 'V-3: one registro created per published Liderazgo template (archived skipped)');
SELECT is((SELECT count(*)::int FROM public.school_via_instance_links WHERE school_id = 9107), 2, 'V-3: two links');
SELECT is((SELECT template_snapshot_id FROM public.assessment_instances WHERE id = pg_temp.inst('e1')),
          '10700000-0000-4000-8000-0000000000f9'::uuid, 'V-3: the current snapshot is used');
SELECT is((SELECT course_structure_id IS NULL AND transformation_year = 2 AND generation_type = 'GT' AND status = 'pending'
             FROM public.assessment_instances WHERE id = pg_temp.inst('e1')),
          true, 'V-3: school-level, year from context, GT, pending');
SELECT is((SELECT string_agg(d->>'outcome', ',')
             FROM jsonb_array_elements(public.assign_school_via_responsible(9107, 'liderazgo', :'dir1', :'dir1')->'details') d),
          'already_exists,already_exists', 'V-3: a re-send is idempotent');
SELECT throws_ok(format($$ SELECT public.assign_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir2', :'admin'),
  'P0001', 'responsible_already_assigned', 'V-3: assigning a different person is refused');
SELECT is(pg_temp.legacy(), (SELECT s FROM vr_legacy), 'V-3: the unlinked school-level instance is untouched');

-- =============================================================================
-- [V-4] Replace
-- =============================================================================
INSERT INTO public.assessment_instance_assignees (instance_id, user_id) VALUES (pg_temp.inst('e1'), :'co');

SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'same_responsible', 'V-4: replacing with the same person is refused');
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'proposito', %L, %L) $$, :'dir2', :'admin'),
  'P0001', 'no_active_responsible', 'V-4: replace needs an active responsible');

SELECT lives_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir2', :'admin'),
  'V-4: untouched registros can be replaced');
SELECT is((SELECT string_agg(user_id::text, ',' ORDER BY user_id) FROM public.assessment_instance_assignees WHERE instance_id = pg_temp.inst('e1')),
          (SELECT string_agg(u::text, ',' ORDER BY u) FROM unnest(ARRAY[:'dir2'::uuid, :'co'::uuid]) u),
          'V-4: the new person is attached, the co-assignee stays, the old person is gone');
SELECT is((SELECT count(*)::int FROM public.school_via_responsibles WHERE school_id = 9107 AND area = 'liderazgo' AND NOT is_active AND replaced_by = :'admin'),
          1, 'V-4: the old responsible row is kept as history');
SELECT lives_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir3', :'admin'),
  'V-4: a second replacement works');
SELECT is((SELECT user_id FROM public.school_via_responsibles WHERE school_id = 9107 AND area = 'liderazgo' AND is_active), :'dir3'::uuid,
  'V-4: the active responsible is the latest');

-- each kind of "touched" refuses the whole replace and writes nothing
CREATE TEMP TABLE vr_before AS SELECT pg_temp.state() AS s;

UPDATE public.assessment_instances SET started_at = now() WHERE id = pg_temp.inst('e2');
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-4: started_at refuses');
UPDATE public.assessment_instances SET started_at = NULL WHERE id = pg_temp.inst('e2');

UPDATE public.assessment_instances SET context_responses = '{"q": 1}' WHERE id = pg_temp.inst('e2');
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-4: context answers refuse');
UPDATE public.assessment_instances SET context_responses = NULL WHERE id = pg_temp.inst('e2');

UPDATE public.assessment_instance_assignees SET has_started = true WHERE instance_id = pg_temp.inst('e2');
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-4: an assignee who started refuses');
UPDATE public.assessment_instance_assignees SET has_started = false WHERE instance_id = pg_temp.inst('e2');

UPDATE public.assessment_instances SET status = 'in_progress' WHERE id = pg_temp.inst('e2');
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-4: a non-pending status refuses');
UPDATE public.assessment_instances SET status = 'pending' WHERE id = pg_temp.inst('e2');

INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
VALUES ('10700000-0000-4000-8000-0000000000b1', '10700000-0000-4000-8000-0000000000e2', 'Obj', 1);
INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order)
VALUES ('10700000-0000-4000-8000-0000000000b2', '10700000-0000-4000-8000-0000000000e2', '10700000-0000-4000-8000-0000000000b1', 'Mod', 1);
INSERT INTO public.assessment_indicators (id, module_id, code, name, category, display_order)
VALUES ('10700000-0000-4000-8000-0000000000b3', '10700000-0000-4000-8000-0000000000b2', 'I1', 'Ind', 'cobertura', 1);
INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value)
VALUES ('10700000-0000-4000-8000-0000000000b4', pg_temp.inst('e2'), '10700000-0000-4000-8000-0000000000b3', true);
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-4: a saved response refuses (pending status alone is not enough)');
DELETE FROM public.assessment_responses WHERE id = '10700000-0000-4000-8000-0000000000b4';

SELECT is(pg_temp.state(), (SELECT s FROM vr_before), 'V-4: every refused replace wrote nothing');

-- =============================================================================
-- [V-5] Cancelled linked registro
-- =============================================================================
SELECT lives_ok(format($$ SELECT public.cancel_assessment_instance(%L, %L, 'prueba') $$, :'admin', pg_temp.inst('e2')),
  'V-5: the registro is cancelled through the cancellation RPC');
SELECT is((SELECT string_agg(d->>'outcome', ',' ORDER BY d->>'template_name')
             FROM jsonb_array_elements(public.assign_school_via_responsible(9107, 'liderazgo', :'dir3', :'admin')->'details') d),
          'cancelled,already_exists', 'V-5: a re-send reports the cancelled registro');
SELECT is((SELECT count(*)::int FROM public.school_via_instance_links WHERE school_id = 9107), 2, 'V-5: nothing is recreated');
SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-5: a cancelled registro refuses replacement');

-- =============================================================================
-- [V-6] Course RPC refuses a school-level vía
-- =============================================================================
SELECT throws_ok($$ SELECT public.attach_course_docente_assessment('10700000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('vr_doc'),
                     '10700000-0000-4000-8000-0000000000f9', 1, 'GT', tests.get_supabase_uid('vr_admin')) $$,
  'P0001', 'via_not_course_level', 'V-6: a Liderazgo template is never attached to a course docente');
SELECT is((SELECT d->>'outcome' FROM (SELECT public.attach_course_docente_assessment('10700000-0000-4000-8000-0000000000a1', :'doc',
                     '10700000-0000-4000-8000-0000000000fc', 1, 'GT', :'admin') AS d) x),
          'created', 'V-6: a Crecimiento template still attaches');

-- =============================================================================
-- [V-7] Response saves on linked instances
-- =============================================================================
INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
VALUES ('10700000-0000-4000-8000-0000000000c1', '10700000-0000-4000-8000-0000000000e1', 'Obj', 1);
INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order)
VALUES ('10700000-0000-4000-8000-0000000000c2', '10700000-0000-4000-8000-0000000000e1', '10700000-0000-4000-8000-0000000000c1', 'Mod', 1);
INSERT INTO public.assessment_indicators (id, module_id, code, name, category, display_order)
VALUES ('10700000-0000-4000-8000-0000000000c3', '10700000-0000-4000-8000-0000000000c2', 'I1', 'Ind', 'cobertura', 1);

SELECT set_config('request.jwt.claims', json_build_object('sub', :'dir1', 'role', 'authenticated')::text, true);
SELECT throws_ok(format($$ INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value) VALUES (%L, '10700000-0000-4000-8000-0000000000c3', true) $$, pg_temp.inst('e1')),
  '42501', 'not_an_assignee', 'V-7: a replaced responsible cannot save (checked even without RLS)');
SELECT set_config('request.jwt.claims', json_build_object('sub', :'dir3', 'role', 'authenticated')::text, true);
SELECT lives_ok(format($$ INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value) VALUES (%L, '10700000-0000-4000-8000-0000000000c3', true) $$, pg_temp.inst('e1')),
  'V-7: the current responsible can save');
SELECT set_config('request.jwt.claims', json_build_object('sub', :'dir1', 'role', 'authenticated')::text, true);
SELECT lives_ok($$ INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value)
                   SELECT id, '10700000-0000-4000-8000-0000000000c3', true FROM public.assessment_instances
                    WHERE course_structure_id = '10700000-0000-4000-8000-0000000000a1' $$,
  'V-7: course instances are not affected by the via guard');
SELECT set_config('request.jwt.claims', NULL, true);

SELECT throws_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'liderazgo', %L, %L) $$, :'dir1', :'admin'),
  'P0001', 'registros_already_started', 'V-7: after a saved answer, replace is refused');

-- =============================================================================
-- [V-8] Real service_role grants
-- =============================================================================
INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
  ('10700000-0000-4000-8000-0000000000e5', 'proposito', '1.0', 'PRO Live', 'published', NULL);
INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('10700000-0000-4000-8000-0000000000f5', '10700000-0000-4000-8000-0000000000e5', '1.0', '{"modules": []}');

SET LOCAL ROLE service_role;
SELECT is((SELECT jsonb_array_length(public.assign_school_via_responsible(9107, 'liderazgo', :'dir3', :'admin')->'details')),
          2, 'V-8: a re-send works as service_role (rule lock through the helper)');
SELECT is((SELECT d->>'outcome' FROM jsonb_array_elements(public.assign_school_via_responsible(9107, 'proposito', :'dir1', :'admin')->'details') d),
          'created', 'V-8: a FIRST assign (responsible + instance + link + grant) works as service_role');
SELECT lives_ok(format($$ SELECT public.replace_school_via_responsible(9107, 'proposito', %L, %L) $$, :'dir2', :'admin'),
  'V-8: a replace works as service_role');
SELECT is((SELECT public.lock_via_rule('liderazgo')), 'school_responsible', 'V-8: service_role can lock-read a rule');
SELECT throws_ok($$ UPDATE public.ab_via_assignment_rules SET target = 'course_docente' WHERE area = 'liderazgo' $$,
  '42501', NULL, 'V-8: service_role cannot update a rule directly');
SELECT throws_ok($$ SELECT public.set_via_assignment_rule('aprendizaje', 'school_responsible') $$,
  '42501', NULL, 'V-8: service_role cannot call the rule-change function');
RESET ROLE;

SELECT tests.authenticate_as('vr_dirx');
SELECT is((SELECT count(*)::int FROM public.school_via_responsibles), 0, 'V-8: a directivo of another school sees no responsibles');
RESET ROLE;
SELECT tests.authenticate_as('vr_dir2');
SELECT ok((SELECT count(*) FROM public.school_via_responsibles) > 0, 'V-8: a directivo of the school sees its responsibles');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
