-- PROC-B5 F1 source guard: synthetic fixtures roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(82);
SELECT tests.create_supabase_user('b5root_admin');
INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
VALUES (tests.get_supabase_uid('b5root_admin'), 'b5root_admin@test.com', 'B5 root admin', 'approved', false)
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, is_active)
VALUES (tests.get_supabase_uid('b5root_admin'), 'admin', true)
ON CONFLICT DO NOTHING;
INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
VALUES (951001, 'B5 root synthetic grade', 951001, false);
INSERT INTO public.assessment_templates (id, name, area, version, status)
VALUES
  ('b5100000-0000-4000-8000-000000000001', 'B5 root synthetic', 'personalizacion', '1.0.0', 'draft'),
  ('b5100000-0000-4000-8000-000000000002', 'B5 root synthetic 2', 'personalizacion', '1.0.0', 'draft');
CREATE FUNCTION pg_temp.b5_rev(p_template_id UUID) RETURNS BIGINT
LANGUAGE sql AS $$
  SELECT COALESCE(
    (SELECT r.revision
       FROM public.assessment_template_source_revisions r
      WHERE r.template_id = p_template_id),
    0::BIGINT)
$$;
CREATE TEMP TABLE b5_area_choice (area TEXT);
CREATE TEMP TABLE b5_rollback_probe (inflight_revision BIGINT);
SELECT is( pg_get_function_result(to_regprocedure('public.bump_template_source_revisions(uuid[])')),
  'void',
  'A1 bump: signature (uuid[]) returns void'
);
SELECT is( (SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.bump_template_source_revisions(uuid[])')),
  true,
  'A1 bump: SECURITY DEFINER'
);
SELECT ok( EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS c
     WHERE p.oid = to_regprocedure('public.bump_template_source_revisions(uuid[])')
       AND replace(c, ' ', '') = 'search_path=pg_catalog,public'
  ),
  'A1 bump: search_path pinned to pg_catalog, public'
);
SELECT is( pg_get_function_result(to_regprocedure('public.guard_assessment_template_source_revision()')),
  'trigger',
  'A1 guard: signature () returns trigger'
);
SELECT is( (SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.guard_assessment_template_source_revision()')),
  true,
  'A1 guard: SECURITY DEFINER'
);
SELECT ok( EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS c
     WHERE p.oid = to_regprocedure('public.guard_assessment_template_source_revision()')
       AND replace(c, ' ', '') = 'search_path=pg_catalog,public'
  ),
  'A1 guard: search_path pinned to pg_catalog, public'
);
SELECT is( (SELECT count(*)::INT FROM pg_trigger t
    WHERE t.tgfoid = to_regprocedure('public.guard_assessment_template_source_revision()')
      AND NOT t.tgisinternal),
  1,
  'A1 guard: attached by exactly one trigger'
);
SELECT is( (SELECT array_agg(t.tgtype::INT) FROM pg_trigger t
    WHERE t.tgfoid = to_regprocedure('public.guard_assessment_template_source_revision()')
      AND t.tgrelid = 'public.assessment_templates'::regclass
      AND NOT t.tgisinternal),
  ARRAY[17],
  'A1 guard: AFTER UPDATE FOR EACH ROW on assessment_templates only'
);
SELECT ok( (SELECT p.proacl IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                           WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
     FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.bump_template_source_revisions(uuid[])')),
  'A1 bump: PUBLIC has no EXECUTE'
);
SELECT ok( (SELECT p.proacl IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                           WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
     FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.guard_assessment_template_source_revision()')),
  'A1 guard: PUBLIC has no EXECUTE'
);
SELECT ok(NOT has_function_privilege('anon', 'public.bump_template_source_revisions(uuid[])', 'EXECUTE'),
  'A1 bump: anon has no EXECUTE');
SELECT ok(NOT has_function_privilege('authenticated', 'public.bump_template_source_revisions(uuid[])', 'EXECUTE'),
  'A1 bump: authenticated has no EXECUTE');
SELECT ok(NOT has_function_privilege('service_role', 'public.bump_template_source_revisions(uuid[])', 'EXECUTE'),
  'A1 bump: service_role has no EXECUTE');
SELECT ok(NOT has_function_privilege('anon', 'public.guard_assessment_template_source_revision()', 'EXECUTE'),
  'A1 guard: anon has no EXECUTE');
SELECT ok(NOT has_function_privilege('authenticated', 'public.guard_assessment_template_source_revision()', 'EXECUTE'),
  'A1 guard: authenticated has no EXECUTE');
SELECT ok(NOT has_function_privilege('service_role', 'public.guard_assessment_template_source_revision()', 'EXECUTE'),
  'A1 guard: service_role has no EXECUTE');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok( $$SELECT public.bump_template_source_revisions(ARRAY['b5100000-0000-4000-8000-000000000001'::UUID])$$,
  '42501', NULL,
  'A1 bump: anon invocation rejected'
);
SELECT is_empty($$UPDATE public.assessment_templates SET name = 'unauthorized'
  WHERE id = 'b5100000-0000-4000-8000-000000000001' RETURNING id$$,
  'A1 anon root source edit updates no rows');
RESET ROLE;
SELECT is((SELECT name FROM public.assessment_templates
  WHERE id = 'b5100000-0000-4000-8000-000000000001'),
  'B5 root synthetic', 'A1 denied edit leaves root source unchanged');
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'),
  0::BIGINT, 'A1 denied edit leaves source revision unchanged');
SELECT tests.authenticate_as('b5root_admin');
SELECT throws_ok( $$SELECT public.bump_template_source_revisions(ARRAY['b5100000-0000-4000-8000-000000000001'::UUID])$$,
  '42501', NULL,
  'A1 bump: authenticated admin invocation rejected'
);
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok( $$SELECT public.bump_template_source_revisions(ARRAY['b5100000-0000-4000-8000-000000000001'::UUID])$$,
  '42501', NULL,
  'A1 bump: service_role invocation rejected'
);
RESET ROLE;
SELECT is( (SELECT count(*)::INT FROM public.assessment_template_source_revisions
    WHERE template_id = 'b5100000-0000-4000-8000-000000000001'),
  0,
  'A2 counter row absent before first bump'
);
SELECT lives_ok( $$SELECT public.bump_template_source_revisions(ARRAY['b5100000-0000-4000-8000-000000000001'::UUID])$$,
  'A2 first bump succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 1::BIGINT,
  'A2 absent counter initializes to 1');
SELECT lives_ok( $$SELECT public.bump_template_source_revisions(ARRAY['b5100000-0000-4000-8000-000000000001'::UUID])$$,
  'A2 second bump succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 2::BIGINT,
  'A2 sequential bump increments by 1');
SELECT lives_ok( $$SELECT public.bump_template_source_revisions(ARRAY[
      'b5100000-0000-4000-8000-000000000001'::UUID,
      'b5100000-0000-4000-8000-000000000001'::UUID,
      NULL])$$,
  'A2 duplicate + NULL array bump succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 3::BIGINT,
  'A2 duplicate ids increment once');
SELECT lives_ok( $$SELECT public.bump_template_source_revisions(ARRAY[
      'b5100000-0000-4000-8000-000000000002'::UUID,
      'b5100000-0000-4000-8000-000000000001'::UUID])$$,
  'A2 multi-template bump succeeds'
);
SELECT is( ARRAY[pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'),
        pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002')],
  ARRAY[4, 1]::BIGINT[],
  'A2 multi-template bump increments each template once'
);
SELECT lives_ok( $$SELECT public.bump_template_source_revisions(ARRAY[
      'b5100000-0000-4000-8000-0000000000ff'::UUID,
      'b5100000-0000-4000-8000-000000000002'::UUID])$$,
  'A2 bump with nonexistent id succeeds'
);
SELECT is( (SELECT count(*)::INT FROM public.assessment_template_source_revisions
    WHERE template_id = 'b5100000-0000-4000-8000-0000000000ff'),
  0,
  'A2 nonexistent id creates no counter row'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002'), 2::BIGINT,
  'A2 existing id alongside nonexistent id still increments');
SELECT lives_ok($$SELECT public.bump_template_source_revisions(NULL)$$,
  'A2 NULL array is a harmless no-op');
SELECT lives_ok($$SELECT public.bump_template_source_revisions('{}'::UUID[])$$,
  'A2 empty array is a harmless no-op');
SELECT lives_ok($$SELECT public.bump_template_source_revisions(ARRAY[NULL]::UUID[])$$,
  'A2 all-NULL array is a harmless no-op');
SELECT is( ARRAY[pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'),
        pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002')],
  ARRAY[4, 2]::BIGINT[],
  'A2 no-op inputs leave counters unchanged'
);
SELECT lives_ok( $$UPDATE public.assessment_templates SET name = 'B5 root synthetic'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 same-value name update succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 4::BIGINT,
  'A3 same-value source update does not bump');
SELECT is((SELECT name FROM public.assessment_templates
  WHERE id = 'b5100000-0000-4000-8000-000000000001'),
  'B5 root synthetic', 'A3 same-value source update leaves source unchanged');
SELECT lives_ok( $$UPDATE public.assessment_templates SET name = 'B5 root synthetic B'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 name A->B succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 5::BIGINT,
  'A3 name A->B bumps');
SELECT lives_ok( $$UPDATE public.assessment_templates SET name = 'B5 root synthetic'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 name B->A succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 6::BIGINT,
  'A3 name A->B->A bumps twice');
SELECT lives_ok( $$UPDATE public.assessment_templates SET description = 'B5 root synthetic description'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 description change succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 7::BIGINT,
  'A3 description change bumps');
DO $$
DECLARE
  v_candidate TEXT;
BEGIN
  FOREACH v_candidate IN ARRAY ARRAY['aprendizaje', 'evaluacion', 'proposito', 'liderazgo', 'familias'] LOOP
    BEGIN
      UPDATE public.assessment_templates SET area = v_candidate
       WHERE id = 'b5100000-0000-4000-8000-000000000001';
      INSERT INTO b5_area_choice (area) VALUES (v_candidate);
      EXIT;
    EXCEPTION WHEN check_violation OR foreign_key_violation OR invalid_text_representation THEN
      NULL;
    END;
  END LOOP;
END
$$;
SELECT ok( EXISTS (
    SELECT 1 FROM b5_area_choice c
      JOIN public.assessment_templates t
        ON t.area = c.area AND t.id = 'b5100000-0000-4000-8000-000000000001'
     WHERE c.area <> 'personalizacion'
  ),
  'A3 area changed to an accepted alternate value'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 8::BIGINT,
  'A3 area change bumps');
SELECT lives_ok( $$UPDATE public.assessment_templates SET grade_id = 951001
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 grade_id NULL->synthetic grade succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 9::BIGINT,
  'A3 grade_id change bumps');
SELECT lives_ok( $$UPDATE public.assessment_templates SET scoring_config = '{"b5": {"weight": 1}}'::JSONB
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 scoring_config change succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 10::BIGINT,
  'A3 scoring_config change bumps');
SELECT lives_ok( $$UPDATE public.assessment_templates SET scoring_config = '{"b5": {"weight": 1}}'::JSONB
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 same-value scoring_config update succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 10::BIGINT,
  'A3 same-value scoring_config update does not bump');
SELECT lives_ok( $$UPDATE public.assessment_templates SET created_at = created_at - INTERVAL '1 day'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 created_at change succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 11::BIGINT,
  'A3 created_at change bumps');
SELECT lives_ok( $$UPDATE public.assessment_templates
       SET name = 'B5 root synthetic renamed',
           description = 'B5 root synthetic description 2'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 multi-field change succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 12::BIGINT,
  'A3 multi-field change in one statement bumps once');
SELECT lives_ok( $$UPDATE public.assessment_templates SET description = 'B5 root synthetic multi-row'
     WHERE id IN ('b5100000-0000-4000-8000-000000000001', 'b5100000-0000-4000-8000-000000000002')$$,
  'A3 multi-row change succeeds'
);
SELECT is( ARRAY[pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'),
        pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002')],
  ARRAY[13, 3]::BIGINT[],
  'A3 multi-row change bumps each changed template once'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok( $$UPDATE public.assessment_templates SET name = 'B5 root synthetic 2 service'
     WHERE id = 'b5100000-0000-4000-8000-000000000002'$$,
  'A3 service_role source update succeeds'
);
RESET ROLE;
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002'), 4::BIGINT,
  'A3 service_role source update bumps via guard');
SELECT lives_ok( $$UPDATE public.assessment_templates SET version = '1.0.1'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 mechanical version update succeeds'
);
SELECT lives_ok( $$UPDATE public.assessment_templates SET updated_at = now() + INTERVAL '1 hour'
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 mechanical updated_at update succeeds'
);
SELECT lives_ok( $$UPDATE public.assessment_templates SET created_by = tests.get_supabase_uid('b5root_admin')
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 mechanical created_by update succeeds'
);
SELECT lives_ok( $$UPDATE public.assessment_templates
       SET status = 'published',
           published_at = now(),
           published_by = tests.get_supabase_uid('b5root_admin')
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 mechanical status/published_* update succeeds'
);
SELECT lives_ok( $$UPDATE public.assessment_templates
       SET is_archived = true,
           archived_at = now(),
           archived_by = tests.get_supabase_uid('b5root_admin')
     WHERE id = 'b5100000-0000-4000-8000-000000000001'$$,
  'A3 mechanical archive update succeeds'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'), 13::BIGINT,
  'A3 mechanical-only updates do not bump');
DO $$
DECLARE
  v_inflight BIGINT;
BEGIN
  BEGIN
    UPDATE public.assessment_templates SET name = 'B5 root synthetic rollback'
     WHERE id = 'b5100000-0000-4000-8000-000000000002';
    SELECT r.revision INTO v_inflight
      FROM public.assessment_template_source_revisions r
     WHERE r.template_id = 'b5100000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'b5 forced rollback' USING ERRCODE = 'P0001';
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO b5_rollback_probe (inflight_revision) VALUES (v_inflight);
  END;
END
$$;
SELECT is((SELECT inflight_revision FROM b5_rollback_probe), 5::BIGINT,
  'A4 source change bumped inside the aborted subtransaction');
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002'), 4::BIGINT,
  'A4 aborted subtransaction rolls back the counter');
SELECT is( (SELECT name FROM public.assessment_templates WHERE id = 'b5100000-0000-4000-8000-000000000002'),
  'B5 root synthetic 2 service',
  'A4 aborted subtransaction rolls back the source change'
);
UPDATE public.assessment_template_source_revisions
   SET revision = 9223372036854775807
 WHERE template_id = 'b5100000-0000-4000-8000-000000000002';
SELECT throws_ok( $$SELECT public.bump_template_source_revisions(ARRAY[
      'b5100000-0000-4000-8000-000000000001'::UUID,
      'b5100000-0000-4000-8000-000000000002'::UUID])$$,
  '22003', NULL,
  'A4 bump at BIGINT max fails with numeric_value_out_of_range'
);
SELECT is( ARRAY[pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'),
        pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002')],
  ARRAY[13, 9223372036854775807]::BIGINT[],
  'A4 overflow rolls back every counter in the call (no wrap, no partial bump)'
);
SELECT throws_ok( $$UPDATE public.assessment_templates SET name = 'B5 root synthetic overflow'
     WHERE id = 'b5100000-0000-4000-8000-000000000002'$$,
  '22003', NULL,
  'A4 source update at BIGINT max fails'
);
SELECT is( (SELECT name FROM public.assessment_templates WHERE id = 'b5100000-0000-4000-8000-000000000002'),
  'B5 root synthetic 2 service',
  'A4 overflowing source update is rolled back'
);
SELECT is(pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002'), 9223372036854775807::BIGINT,
  'A4 counter unchanged after overflowing source update');
SELECT tests.authenticate_as('b5root_admin');
SELECT throws_ok( $$INSERT INTO public.assessment_template_source_revisions (template_id, revision)
    VALUES ('b5100000-0000-4000-8000-0000000000ff', 99)$$,
  '42501', NULL,
  'A4 admin direct counter INSERT denied'
);
SELECT throws_ok( $$UPDATE public.assessment_template_source_revisions SET revision = 99
     WHERE template_id = 'b5100000-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'A4 admin direct counter UPDATE denied'
);
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok( $$INSERT INTO public.assessment_template_source_revisions (template_id, revision)
    VALUES ('b5100000-0000-4000-8000-0000000000ff', 99)$$,
  '42501', NULL,
  'A4 service_role direct counter INSERT denied'
);
SELECT throws_ok( $$UPDATE public.assessment_template_source_revisions SET revision = 99
     WHERE template_id = 'b5100000-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'A4 service_role direct counter UPDATE denied'
);
RESET ROLE;
SELECT is( ARRAY[pg_temp.b5_rev('b5100000-0000-4000-8000-000000000001'),
        pg_temp.b5_rev('b5100000-0000-4000-8000-000000000002')],
  ARRAY[13, 9223372036854775807]::BIGINT[],
  'A4 denied direct writes leave counters unchanged'
);
SELECT * FROM finish();
ROLLBACK;
