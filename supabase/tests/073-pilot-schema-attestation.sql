-- =============================================================================
-- 073-pilot-schema-attestation.sql — Procesos de Cambio review remediation
-- (R10): the versioned, read-only schema attestation for pilot provisioning.
--
-- Proves public.pilot_schema_attestation (20260908110000):
--   [A-0] the function exists, is SECURITY INVOKER (not definer), STABLE,
--         and only service_role may EXECUTE it (anon, authenticated: none);
--   [A-1] anon and authenticated are refused at call time (42501);
--   [A-2] the payload is deterministic (two calls are byte-identical), carries
--         attestation_version 1, no missing table or function, every required
--         table with RLS enabled, and the two remediation RPCs with their
--         grants; the referencing foreign-key graph covers the cascade edges
--         the synthetic reset walks;
--   [A-3] the payload carries catalog definitions only — no row content: a
--         synthetic school name inserted in this transaction never appears.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(23);

INSERT INTO public.schools (id, name) VALUES (9995, 'ZZ Attestation Canary School 9995') ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE att AS SELECT public.pilot_schema_attestation() AS a;

-- =============================================================================
-- [A-0] Objects and privileges
-- =============================================================================
SELECT has_function('public', 'pilot_schema_attestation', ARRAY[]::text[],
  'A-0: pilot_schema_attestation() exists');
SELECT is(p.prosecdef, false, 'A-0: pilot_schema_attestation is SECURITY INVOKER')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'pilot_schema_attestation';
SELECT is(p.provolatile, 's', 'A-0: pilot_schema_attestation is STABLE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'pilot_schema_attestation';
SELECT function_privs_are('public', 'pilot_schema_attestation', ARRAY[]::text[], 'anon', ARRAY[]::text[],
  'A-0: anon holds no privilege');
SELECT function_privs_are('public', 'pilot_schema_attestation', ARRAY[]::text[], 'authenticated', ARRAY[]::text[],
  'A-0: authenticated holds no privilege');
SELECT function_privs_are('public', 'pilot_schema_attestation', ARRAY[]::text[], 'service_role', ARRAY['EXECUTE'],
  'A-0: service_role may EXECUTE');

-- =============================================================================
-- [A-1] Refused at call time for anon / authenticated
-- =============================================================================
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('role', 'anon', true);
SELECT throws_ok($$ SELECT public.pilot_schema_attestation() $$, '42501', NULL, 'A-1: anon is refused');
RESET ROLE;
SELECT set_config('role', 'authenticated', true);
SELECT throws_ok($$ SELECT public.pilot_schema_attestation() $$, '42501', NULL, 'A-1: authenticated is refused');
RESET ROLE;
SELECT set_config('role', 'service_role', true);
SELECT lives_ok($$ SELECT public.pilot_schema_attestation() $$, 'A-1: service_role may call it');
RESET ROLE;

-- =============================================================================
-- [A-2] Deterministic, complete, versioned
-- =============================================================================
SELECT is((SELECT a::text FROM att), public.pilot_schema_attestation()::text, 'A-2: two calls are byte-identical');
SELECT is((SELECT (a->>'attestation_version')::int FROM att), 1, 'A-2: attestation_version is 1');
SELECT is((SELECT a->'missing_tables' FROM att), '[]'::jsonb, 'A-2: no required table is missing');
SELECT is((SELECT a->'missing_functions' FROM att), '[]'::jsonb, 'A-2: no required function is missing');
SELECT is((SELECT jsonb_array_length(a->'tables') FROM att), 21, 'A-2: 21 required tables are described');
SELECT is((SELECT count(*)::int FROM att, jsonb_array_elements(a->'tables') t WHERE (t->>'rls_enabled')::boolean = false), 0,
  'A-2: every required table has RLS enabled');
SELECT ok((SELECT count(*) FROM att, jsonb_array_elements(a->'functions') f WHERE f->>'name' = 'save_transversal_context') = 1,
  'A-2: save_transversal_context is attested');
SELECT is((SELECT f->'privileges' FROM att, jsonb_array_elements(a->'functions') f WHERE f->>'name' = 'save_transversal_context'),
  '[{"grantee": "authenticated", "privilege": "EXECUTE"}, {"grantee": "service_role", "privilege": "EXECUTE"}]'::jsonb,
  'A-2: save_transversal_context grants are attested exactly');
SELECT is((SELECT f->'privileges' FROM att, jsonb_array_elements(a->'functions') f WHERE f->>'name' = 'pilot_schema_attestation'),
  '[{"grantee": "service_role", "privilege": "EXECUTE"}]'::jsonb,
  'A-2: the attestation attests its own least-privilege grant');
SELECT ok((SELECT count(*) FROM att, jsonb_array_elements(a->'referencing_foreign_keys') e
            WHERE e->>'child' = 'assessment_sub_questions' AND e->>'parent' = 'assessment_indicators' AND e->>'on_delete' = 'CASCADE') = 1,
  'A-2: the sub-question cascade edge (the old reset blind spot) is attested');
SELECT ok((SELECT count(*) FROM att, jsonb_array_elements(a->'referencing_foreign_keys') e
            WHERE e->>'child' = 'assessment_instances' AND e->>'parent' = 'assessment_template_snapshots' AND e->>'on_delete' = 'RESTRICT') = 1,
  'A-2: the instance -> snapshot RESTRICT edge is attested');
SELECT ok((SELECT count(*) FROM att, jsonb_array_elements(a->'referencing_foreign_keys') e WHERE e->>'parent' = 'schools') >= 25,
  'A-2: every foreign key referencing schools is attested');
SELECT ok((SELECT count(*) FROM att, jsonb_array_elements(a->'tables') t, jsonb_array_elements(t->'unique_indexes') u
            WHERE t->>'name' = 'assessment_instances' AND u->>'name' = 'assessment_instances_course_snapshot_active_key') = 1,
  'A-2: the one-live-instance unique index is attested');

-- =============================================================================
-- [A-3] No row content
-- =============================================================================
SELECT ok((SELECT a::text NOT LIKE '%ZZ Attestation Canary School 9995%' FROM att),
  'A-3: the payload never carries row data (a synthetic school name is absent)');

SELECT * FROM finish();
ROLLBACK;
