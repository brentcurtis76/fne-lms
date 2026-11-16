-- =============================================================================
-- 128-gestor-publish-atomic.sql — GENERA fixes F8, send-back 1 (GC-10).
-- Proves public.publish_assessment_template (migration
-- 20261116179500_gestor_publish_atomic.sql):
--   * service role only (anon and signed-in people: permission denied);
--   * two drafts duplicated from one published template both publish, each at
--     its own next free version, each with its own snapshot;
--   * refuses, writing nothing, when the template is no longer a draft at the
--     version the caller read (another publisher got there first);
--   * a leftover snapshot of an earlier failed attempt is overwritten in place
--     and the publication succeeds; a snapshot an instance refers to and the
--     snapshot of a published template are never touched;
--   * a refusal of the vía-rule guard rolls the snapshot back with the flip.
-- Synthetic fixtures (grade 128001, uuids 12800000-…); everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(45);

-- -----------------------------------------------------------------------------
-- Structure and grants
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'publish_assessment_template', ARRAY['uuid', 'text', 'jsonb']::name[],
  'publish_assessment_template(uuid, text, jsonb) exists');
SELECT function_returns('public', 'publish_assessment_template', ARRAY['uuid', 'text', 'jsonb']::name[],
  'jsonb', 'it returns jsonb');
SELECT is_definer('public', 'publish_assessment_template', ARRAY['uuid', 'text', 'jsonb']::name[],
  'it is SECURITY DEFINER');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
           WHERE p.oid = 'public.publish_assessment_template(uuid, text, jsonb)'::regprocedure
             AND cfg = 'search_path=public, pg_temp'),
  'it pins search_path = public, pg_temp');
SELECT function_privs_are('public', 'publish_assessment_template', ARRAY['uuid', 'text', 'jsonb']::name[],
  'service_role', ARRAY['EXECUTE']::name[], 'service_role can execute it');
SELECT function_privs_are('public', 'publish_assessment_template', ARRAY['uuid', 'text', 'jsonb']::name[],
  'authenticated', ARRAY[]::name[], 'authenticated cannot execute it');
SELECT function_privs_are('public', 'publish_assessment_template', ARRAY['uuid', 'text', 'jsonb']::name[],
  'anon', ARRAY[]::name[], 'anon cannot execute it');
SELECT ok(
  NOT has_function_privilege('public', 'public.publish_assessment_template(uuid, text, jsonb)', 'EXECUTE'),
  'PUBLIC cannot execute it');
SELECT ok(
  position('delete' IN lower(pg_get_functiondef('public.publish_assessment_template(uuid, text, jsonb)'::regprocedure))) = 0,
  'the function body contains no DELETE');

-- -----------------------------------------------------------------------------
-- Fixtures (postgres)
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('gc128_admin');
INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
VALUES (tests.get_supabase_uid('gc128_admin'), 'gc128_admin@test.local', 'gc128_admin', 'approved', false);
INSERT INTO public.user_roles (user_id, role_type, is_active)
VALUES (tests.get_supabase_uid('gc128_admin'), 'admin', true);

INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
VALUES (128001, 'F8-128 nivel sintético', 128001, false);

-- A published template (1.1.0) with its snapshot, and two drafts duplicated from it.
INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
  ('12800000-0000-4000-8000-000000000001', 'evaluacion', '1.1.0', 'F8-128 Instrumento', 'published', 128001),
  ('12800000-0000-4000-8000-000000000002', 'evaluacion', '1.1.1', 'F8-128 Instrumento (copia)', 'draft', 128001),
  ('12800000-0000-4000-8000-000000000003', 'evaluacion', '1.1.2', 'F8-128 Instrumento (copia)', 'draft', 128001),
  ('12800000-0000-4000-8000-000000000004', 'evaluacion', '1.1.3', 'F8-128 Instrumento (copia)', 'draft', 128001),
  -- grade-less scopes (name), one per leftover case
  ('12800000-0000-4000-8000-000000000005', 'liderazgo', '1.0.0', 'F8-128 Liderazgo con resto', 'draft', NULL),
  ('12800000-0000-4000-8000-000000000006', 'liderazgo', '1.0.0', 'F8-128 Liderazgo con registro', 'draft', NULL),
  -- a school-level vía draft that still carries a grade: the guard refuses its flip
  ('12800000-0000-4000-8000-000000000007', 'liderazgo', '1.0.0', 'F8-128 Liderazgo con nivel', 'draft', 128001);

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('12800000-0000-4000-8000-0000000000a1', '12800000-0000-4000-8000-000000000001', '1.1.0', '{"original": true}'),
  -- what the old code left behind after a failed flip (nothing refers to it)
  ('12800000-0000-4000-8000-0000000000a5', '12800000-0000-4000-8000-000000000005', '1.1.0', '{"leftover": true}'),
  -- a snapshot an instance refers to, at the version the draft would publish to
  ('12800000-0000-4000-8000-0000000000a6', '12800000-0000-4000-8000-000000000006', '1.1.0', '{"referenced": true}');

INSERT INTO public.assessment_instances (id, template_snapshot_id, transformation_year, status)
VALUES ('12800000-0000-4000-8000-0000000000b6', '12800000-0000-4000-8000-0000000000a6', 1, 'pending');

-- -----------------------------------------------------------------------------
-- Nobody but the service role can call it
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('gc128_admin');
SELECT throws_ok(
  $$SELECT public.publish_assessment_template('12800000-0000-4000-8000-000000000002', '1.1.1', '{"x": 1}')$$,
  '42501', NULL, 'a signed-in admin cannot call it (permission denied)');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.publish_assessment_template('12800000-0000-4000-8000-000000000002', '1.1.1', '{"x": 1}')$$,
  '42501', NULL, 'a visitor cannot call it (permission denied)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.assessment_template_snapshots
            WHERE template_id = '12800000-0000-4000-8000-000000000002'), 0,
  'the refused calls wrote no snapshot');

-- -----------------------------------------------------------------------------
-- Two copies of one published template both publish
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
CREATE TEMP TABLE r128 (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
INSERT INTO r128 VALUES ('copy1', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000002', '1.1.1', '{"copy": 1}'));
INSERT INTO r128 VALUES ('copy2', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000003', '1.1.2', '{"copy": 2}'));
RESET ROLE;

SELECT is((SELECT v->>'ok' FROM r128 WHERE k = 'copy1'), 'true', 'the first copy publishes');
SELECT is((SELECT v->>'version' FROM r128 WHERE k = 'copy1'), '1.2.0', 'the first copy gets 1.2.0 (1.1.1: minor + 1)');
SELECT is((SELECT v->>'ok' FROM r128 WHERE k = 'copy2'), 'true', 'the second copy publishes too');
SELECT is((SELECT v->>'version' FROM r128 WHERE k = 'copy2'), '1.3.0', 'the second copy gets the next free version, 1.3.0');
SELECT results_eq(
  $$SELECT status, version FROM public.assessment_templates
     WHERE id IN ('12800000-0000-4000-8000-000000000002', '12800000-0000-4000-8000-000000000003') ORDER BY version$$,
  $$VALUES ('published'::text, '1.2.0'::text), ('published'::text, '1.3.0'::text)$$,
  'both copies are published, at two different versions');
SELECT results_eq(
  $$SELECT template_id::text, version, snapshot_data FROM public.assessment_template_snapshots
     WHERE template_id IN ('12800000-0000-4000-8000-000000000002', '12800000-0000-4000-8000-000000000003') ORDER BY version$$,
  $$VALUES ('12800000-0000-4000-8000-000000000002', '1.2.0'::text, '{"copy": 1}'::jsonb),
           ('12800000-0000-4000-8000-000000000003', '1.3.0'::text, '{"copy": 2}'::jsonb)$$,
  'each copy has its own snapshot, at its version');
SELECT is((SELECT v->'snapshot'->>'id' FROM r128 WHERE k = 'copy1'),
  (SELECT id::text FROM public.assessment_template_snapshots WHERE template_id = '12800000-0000-4000-8000-000000000002'),
  'the answer names the snapshot it wrote');
SELECT is((SELECT v->'template'->>'status' FROM r128 WHERE k = 'copy1'), 'published', 'the answer carries the flipped template');
SELECT results_eq(
  $$SELECT status, version FROM public.assessment_templates WHERE id = '12800000-0000-4000-8000-000000000001'$$,
  $$VALUES ('published'::text, '1.1.0'::text)$$,
  'the template already published keeps its version');

-- -----------------------------------------------------------------------------
-- The race: no longer a draft at the version read -> refused, nothing written
-- -----------------------------------------------------------------------------
-- The other publisher got there first.
UPDATE public.assessment_templates SET status = 'published', version = '1.4.0'
 WHERE id = '12800000-0000-4000-8000-000000000004';
SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('raced', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000004', '1.1.3', '{"late": true}'));
RESET ROLE;
SELECT is((SELECT v FROM r128 WHERE k = 'raced'), '{"ok": false, "code": "template_not_draft"}'::jsonb,
  'a template that is no longer a draft is refused');
SELECT is((SELECT count(*)::int FROM public.assessment_template_snapshots
            WHERE template_id = '12800000-0000-4000-8000-000000000004'), 0,
  'the refusal wrote no snapshot');
SELECT results_eq(
  $$SELECT status, version FROM public.assessment_templates WHERE id = '12800000-0000-4000-8000-000000000004'$$,
  $$VALUES ('published'::text, '1.4.0'::text)$$,
  'the refusal left the other publication as it was');

-- Still a draft but at another version than the one read (it changed meanwhile).
UPDATE public.assessment_templates SET status = 'draft', version = '1.1.5'
 WHERE id = '12800000-0000-4000-8000-000000000004';
SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('stale', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000004', '1.1.3', '{"late": true}'));
RESET ROLE;
SELECT is((SELECT v->>'code' FROM r128 WHERE k = 'stale'), 'template_not_draft',
  'a draft at another version than the one read is refused');
SELECT is((SELECT count(*)::int FROM public.assessment_template_snapshots
            WHERE template_id = '12800000-0000-4000-8000-000000000004'), 0,
  'that refusal wrote no snapshot either');

-- A published template, called with its own published version, is refused and its snapshot untouched.
SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('published', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000001', '1.1.0', '{"overwrite": true}'));
RESET ROLE;
SELECT is((SELECT v->>'code' FROM r128 WHERE k = 'published'), 'template_not_draft',
  'a published template is refused');
SELECT results_eq(
  $$SELECT id::text, version, snapshot_data FROM public.assessment_template_snapshots
     WHERE template_id = '12800000-0000-4000-8000-000000000001'$$,
  $$VALUES ('12800000-0000-4000-8000-0000000000a1', '1.1.0'::text, '{"original": true}'::jsonb)$$,
  'the snapshot of a published template is never touched');

SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('missing', public.publish_assessment_template(
  '12800000-0000-4000-8000-0000000000ff', '1.0.0', '{"x": 1}'));
RESET ROLE;
SELECT is((SELECT v FROM r128 WHERE k = 'missing'), '{"ok": false, "code": "template_not_found"}'::jsonb,
  'an unknown template is refused');

-- -----------------------------------------------------------------------------
-- Leftover snapshots of an earlier failed attempt
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('leftover', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000005', '1.0.0', '{"fresh": true}'));
RESET ROLE;
SELECT is((SELECT v->>'ok' FROM r128 WHERE k = 'leftover'), 'true',
  'a draft with an unreferenced leftover snapshot publishes');
SELECT is((SELECT v->>'version' FROM r128 WHERE k = 'leftover'), '1.1.0', 'at the version of the leftover');
SELECT results_eq(
  $$SELECT id::text, version, snapshot_data, created_by FROM public.assessment_template_snapshots
     WHERE template_id = '12800000-0000-4000-8000-000000000005'$$,
  $$VALUES ('12800000-0000-4000-8000-0000000000a5', '1.1.0'::text, '{"fresh": true}'::jsonb, NULL::uuid)$$,
  'the leftover row was overwritten in place with the new content (one row, same id)');
SELECT is((SELECT v->'snapshot'->>'id' FROM r128 WHERE k = 'leftover'), '12800000-0000-4000-8000-0000000000a5',
  'the answer names the overwritten row');
SELECT results_eq(
  $$SELECT status, version FROM public.assessment_templates WHERE id = '12800000-0000-4000-8000-000000000005'$$,
  $$VALUES ('published'::text, '1.1.0'::text)$$,
  'and the template is published');

SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('referenced', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000006', '1.0.0', '{"fresh": true}'));
RESET ROLE;
SELECT is((SELECT v->>'code' FROM r128 WHERE k = 'referenced'), 'snapshot_in_use',
  'a snapshot an instance refers to makes the call refuse');
SELECT results_eq(
  $$SELECT id::text, snapshot_data FROM public.assessment_template_snapshots
     WHERE template_id = '12800000-0000-4000-8000-000000000006'$$,
  $$VALUES ('12800000-0000-4000-8000-0000000000a6', '{"referenced": true}'::jsonb)$$,
  'that snapshot is neither removed nor overwritten');
SELECT is((SELECT template_snapshot_id::text FROM public.assessment_instances WHERE id = '12800000-0000-4000-8000-0000000000b6'),
  '12800000-0000-4000-8000-0000000000a6', 'the instance still refers to it');
SELECT results_eq(
  $$SELECT status, version FROM public.assessment_templates WHERE id = '12800000-0000-4000-8000-000000000006'$$,
  $$VALUES ('draft'::text, '1.0.0'::text)$$,
  'and the template stays a draft');

-- -----------------------------------------------------------------------------
-- A refused flip rolls the snapshot back with it
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.publish_assessment_template('12800000-0000-4000-8000-000000000007', '1.0.0', '{"x": 1}')$$,
  'P0001', 'template_grade_not_allowed', 'the vía-rule guard refuses the flip of a school-level template with a grade');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.assessment_template_snapshots
            WHERE template_id = '12800000-0000-4000-8000-000000000007'), 0,
  'the refused call left no snapshot');
SELECT results_eq(
  $$SELECT status FROM public.assessment_templates WHERE id = '12800000-0000-4000-8000-000000000007'$$,
  $$VALUES ('draft'::text)$$,
  'and the template stays a draft');

-- Corrected (grade removed), it publishes.
UPDATE public.assessment_templates SET grade_id = NULL WHERE id = '12800000-0000-4000-8000-000000000007';
SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('corrected', public.publish_assessment_template(
  '12800000-0000-4000-8000-000000000007', '1.0.0', '{"x": 1}'));
RESET ROLE;
SELECT is((SELECT v->>'version' FROM r128 WHERE k = 'corrected'), '1.1.0', 'once corrected it publishes at 1.1.0');
SELECT is((SELECT count(*)::int FROM public.assessment_template_snapshots
            WHERE template_id = '12800000-0000-4000-8000-000000000007'), 1,
  'with exactly one snapshot');

-- A version taken by another template of the scope (a draft) is skipped.
INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
  ('12800000-0000-4000-8000-000000000008', 'evaluacion', '1.4.0', 'F8-128 Instrumento (otra)', 'draft', 128001),
  ('12800000-0000-4000-8000-000000000009', 'evaluacion', '1.5.0', 'F8-128 Instrumento (otra 2)', 'draft', 128001),
  ('12800000-0000-4000-8000-00000000000a', 'evaluacion', '1.1.6', 'F8-128 Instrumento (copia 4)', 'draft', 128001);
-- highest held: 1.3.0 (copy 2) -> 1.4.0 is held by template 8, 1.5.0 by template 9 -> 1.6.0
SET LOCAL ROLE service_role;
INSERT INTO r128 VALUES ('skip', public.publish_assessment_template(
  '12800000-0000-4000-8000-00000000000a', '1.1.6', '{"x": 1}'));
RESET ROLE;
SELECT is((SELECT v->>'version' FROM r128 WHERE k = 'skip'), '1.6.0',
  'versions held by other templates of the scope are skipped');
SELECT is((SELECT count(*)::int FROM public.assessment_templates
            WHERE area = 'evaluacion' AND grade_id = 128001 AND status = 'published'), 4,
  'four published templates in the scope, no collision');

SELECT * FROM finish();
ROLLBACK;
