-- =============================================================================
-- 099-group_submission_save.sql — NOTIF-10
--
-- Covers migration 20260928120000_group_submission_save.sql
-- (public.save_group_submission, an atomic compare-and-set group save):
--   A shape and privileges: SECURITY INVOKER, search_path pinned, EXECUTE for
--     service_role only
--   B first save of a group with no rows; a second first-save loses (conflict)
--   C mixed rows (a member added later) and a pending row with NULL stamp
--   D an INSERT failure after the UPDATE (generic error, real 23505) undoes all
--   E a row the caller did not see (competing claim) -> conflict
--   F stale stamp, claimed-but-missing row, non-member key -> conflict
--   G non-advancing stamp (including a former member's row) -> conflict
--   H actor not a member, group/assignment mismatch -> forbidden
--   I anon and authenticated cannot execute it (42501)
--   J invalid input -> 22023
--   K RLS stays enabled on the three tables
--
-- Every negative case also asserts the rows did not change. Synthetic fixtures
-- only (UUIDs 99000000-..., *@qa.local.test). Everything is rolled back.
-- =============================================================================

BEGIN;

SELECT plan(45);

-- ---------------------------------------------------------------------------
-- A — shape and privileges (postgres)
-- ---------------------------------------------------------------------------
SELECT has_function('public', 'save_group_submission',
  ARRAY['text', 'uuid', 'uuid', 'text', 'text', 'timestamp with time zone', 'jsonb'],
  'A: save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb) exists');
SELECT function_returns('public', 'save_group_submission',
  ARRAY['text', 'uuid', 'uuid', 'text', 'text', 'timestamp with time zone', 'jsonb'], 'jsonb',
  'A: it returns jsonb');
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb)'::regprocedure),
  false, 'A: SECURITY INVOKER');
SELECT is(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb)'::regprocedure),
  ARRAY['search_path=""'], 'A: search_path is pinned to empty');
SELECT is(
  (SELECT provolatile FROM pg_proc WHERE oid = 'public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb)'::regprocedure),
  'v'::"char", 'A: VOLATILE');
SELECT is(
  ARRAY(SELECT has_function_privilege(r, 'public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb)', 'EXECUTE')
          FROM unnest(ARRAY['service_role', 'anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[true, false, false, false],
  'A: EXECUTE for service_role only (not anon, authenticated or PUBLIC)');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb)'::regprocedure
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0, 'A: the ACL has no PUBLIC, anon or authenticated entry');

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (postgres). Group NN lives on assignment 'gs099-NN';
-- A and B are members of every group, C of none.
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_a uuid := tests.create_supabase_user('gs099_a', 'gs099-a@qa.local.test');
  v_b uuid := tests.create_supabase_user('gs099_b', 'gs099-b@qa.local.test');
  v_c uuid := tests.create_supabase_user('gs099_c', 'gs099-c@qa.local.test');
  v_n text[] := ARRAY['10', '20', '21', '30', '40', '50', '60', '70', '80'];
BEGIN
  PERFORM set_config('gs.a', v_a::text, false);
  PERFORM set_config('gs.b', v_b::text, false);
  PERFORM set_config('gs.c', v_c::text, false);

  INSERT INTO public.schools (id, name) VALUES (9099, 'GS099 school (pgTAP 099)')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.group_assignment_groups (id, assignment_id, name, school_id)
  SELECT ('99000000-0000-4000-8000-0000000000' || n)::uuid, 'gs099-' || n, 'GS099 group ' || n, 9099
    FROM unnest(v_n) n;
  INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id)
  SELECT ('99000000-0000-4000-8000-0000000000' || n)::uuid, 'gs099-' || n, u
    FROM unnest(v_n) n, unnest(ARRAY[v_a, v_b]) u;

  INSERT INTO public.group_assignment_submissions
    (assignment_id, group_id, user_id, content, file_url, status, submitted_at)
  SELECT 'gs099-' || r.n, ('99000000-0000-4000-8000-0000000000' || r.n)::uuid,
         current_setting('gs.' || r.who)::uuid, r.content, r.file_url, r.status, r.at::timestamptz
    FROM (VALUES
      ('20', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00.123456+00'),
      ('21', 'a', NULL, NULL, 'pending', NULL),
      ('30', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00'),
      ('40', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00'),
      ('40', 'b', 'competing claim', NULL, 'pending', NULL),
      ('50', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00'),
      ('60', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00'),
      ('60', 'b', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00'),
      ('60', 'c', 'v0', 'f-v0', 'submitted', '2026-09-28 12:00:00+00'),
      ('70', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00'),
      ('80', 'a', 'v1', 'f-v1', 'submitted', '2026-09-28 10:00:00+00')
    ) AS r(n, who, content, file_url, status, at);
END
$fixture$;

-- Save group NN as the given actor ('none' -> NULL actor); file_url = 'f-' || content.
CREATE FUNCTION pg_temp.gs_save(p_n text, p_actor text, p_content text, p_at timestamptz,
                                p_expected jsonb, p_assignment text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.save_group_submission(
    coalesce(p_assignment, 'gs099-' || p_n), ('99000000-0000-4000-8000-0000000000' || p_n)::uuid,
    current_setting('gs.' || p_actor, true)::uuid, p_content, 'f-' || p_content, p_at, p_expected);
$$;
-- Expected-state object from (actor key, ISO stamp or NULL) pairs.
CREATE FUNCTION pg_temp.gs_exp(VARIADIC p_pairs text[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_object_agg(current_setting('gs.' || p_pairs[i]), to_jsonb(p_pairs[i + 1]))
    FROM generate_series(1, array_length(p_pairs, 1), 2) i;
$$;
-- Row state of an assignment: who=content|file_url|status|UTC stamp|group suffix.
CREATE FUNCTION pg_temp.gs_rows(p_assignment text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(r, ' ' ORDER BY r), '')
    FROM (SELECT CASE s.user_id::text WHEN current_setting('gs.a') THEN 'A'
                                      WHEN current_setting('gs.b') THEN 'B' ELSE 'C' END
                 || '=' || coalesce(s.content, '-') || '|' || coalesce(s.file_url, '-') || '|' || s.status
                 || '|' || coalesce(to_char(s.submitted_at AT TIME ZONE 'UTC', 'HH24:MI:SS.US'), '-')
                 || '|' || right(s.group_id::text, 2) AS r
            FROM public.group_assignment_submissions s
           WHERE s.assignment_id = p_assignment) x;
$$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---------------------------------------------------------------------------
-- B — first save of a 2-member group with no rows
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.gs_save('10', 'a', 'v1', '2026-09-28 10:00:00+00', '{}'),
  jsonb_build_object('outcome', 'saved', 'submitted_at', '2026-09-28 10:00:00+00'::timestamptz),
  'B: first save returns saved with the persisted stamp');
SELECT is(pg_temp.gs_rows('gs099-10'),
  'A=v1|f-v1|submitted|10:00:00.000000|10 B=v1|f-v1|submitted|10:00:00.000000|10',
  'B: both members have a row with that content and stamp');
SELECT is(pg_temp.gs_save('10', 'b', 'v1b', '2026-09-28 11:00:00+00', '{}'),
  '{"outcome": "conflict"}'::jsonb,
  'B: a second first-save that read no rows gets conflict');
SELECT is(pg_temp.gs_rows('gs099-10'),
  'A=v1|f-v1|submitted|10:00:00.000000|10 B=v1|f-v1|submitted|10:00:00.000000|10',
  'B: the losing save changed nothing');

-- ---------------------------------------------------------------------------
-- C — mixed rows (R2-F1): A has v1 at T1, B was added later (no row)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.gs_save('20', 'a', 'v2', '2026-09-28 11:00:00+00',
                          pg_temp.gs_exp('a', '2026-09-28T10:00:00.123456+00:00')),
  jsonb_build_object('outcome', 'saved', 'submitted_at', '2026-09-28 11:00:00+00'::timestamptz),
  'C: save v2 with expected {A: T1 (microseconds)} returns saved');
SELECT is(pg_temp.gs_rows('gs099-20'),
  'A=v2|f-v2|submitted|11:00:00.000000|20 B=v2|f-v2|submitted|11:00:00.000000|20',
  'C: A is updated and B is inserted, both v2 at T2');
SELECT is(pg_temp.gs_save('21', 'b', 'v1', '2026-09-28 10:00:00+00', pg_temp.gs_exp('a', NULL)),
  jsonb_build_object('outcome', 'saved', 'submitted_at', '2026-09-28 10:00:00+00'::timestamptz),
  'C: a JSON null expectation matches a pending row with NULL submitted_at');
SELECT is(pg_temp.gs_rows('gs099-21'),
  'A=v1|f-v1|submitted|10:00:00.000000|21 B=v1|f-v1|submitted|10:00:00.000000|21',
  'C: the pending row is submitted and the missing row inserted');

-- ---------------------------------------------------------------------------
-- D — the INSERT fails after the UPDATE (mixed rows in group 30)
-- ---------------------------------------------------------------------------
RESET ROLE;
-- (i) generic error; its message shows A was already v2 when the INSERT ran.
CREATE FUNCTION pg_temp.gs_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gs099 forced insert failure after A=%',
    (SELECT s.content FROM public.group_assignment_submissions s
      WHERE s.assignment_id = NEW.assignment_id AND s.user_id::text = pg_catalog.current_setting('gs.a'))
    USING ERRCODE = 'P0001';
END
$$;
CREATE TRIGGER zz_gs099_fail_insert BEFORE INSERT ON public.group_assignment_submissions
  FOR EACH ROW WHEN (NEW.assignment_id = 'gs099-30') EXECUTE FUNCTION pg_temp.gs_fail_insert();
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT pg_temp.gs_save('30', 'a', 'v2', '2026-09-28 11:00:00+00', pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00'))$$,
  'P0001', 'gs099 forced insert failure after A=v2',
  'D: a generic INSERT error after the UPDATE propagates out of the call');
RESET ROLE;
DROP TRIGGER zz_gs099_fail_insert ON public.group_assignment_submissions;
SELECT is(pg_temp.gs_rows('gs099-30'), 'A=v1|f-v1|submitted|10:00:00.000000|30',
  'D: after the generic error A is still v1 at T1 and B has no row');

-- (ii) a competing row for the same (assignment, user) lands just before the
-- INSERT, so the INSERT hits the real unique constraint.
CREATE FUNCTION pg_temp.gs_compete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_catalog.pg_trigger_depth() = 1 THEN
    INSERT INTO public.group_assignment_submissions (assignment_id, group_id, user_id, content, status)
    VALUES (NEW.assignment_id, NEW.group_id, NEW.user_id, 'competing claim', 'submitted');
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER zz_gs099_compete BEFORE INSERT ON public.group_assignment_submissions
  FOR EACH ROW WHEN (NEW.assignment_id = 'gs099-30') EXECUTE FUNCTION pg_temp.gs_compete();
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT pg_temp.gs_save('30', 'a', 'v2', '2026-09-28 11:00:00+00', pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00'))$$,
  '23505', 'duplicate key value violates unique constraint "group_assignment_submissions_assignment_id_user_id_key"',
  'D: a competing claim at insert time raises 23505 out of the call');
RESET ROLE;
DROP TRIGGER zz_gs099_compete ON public.group_assignment_submissions;
SELECT is(pg_temp.gs_rows('gs099-30'), 'A=v1|f-v1|submitted|10:00:00.000000|30',
  'D: after the 23505 A is still v1 at T1 and B has no row');
SET LOCAL ROLE service_role;

-- ---------------------------------------------------------------------------
-- E — competing claim visible at the lock: B has a row the caller did not see
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.gs_save('40', 'a', 'v2', '2026-09-28 11:00:00+00', pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "conflict"}'::jsonb, 'E: a member row missing from expected gives conflict');
SELECT is(pg_temp.gs_rows('gs099-40'),
  'A=v1|f-v1|submitted|10:00:00.000000|40 B=competing claim|-|pending|-|40',
  'E: neither A nor B changed');

-- ---------------------------------------------------------------------------
-- F — wrong expected state (A has v1 at T1, B no row)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.gs_save('50', 'a', 'v2', '2026-09-28 11:00:00+00', pg_temp.gs_exp('a', '2026-09-28T09:00:00+00:00')),
  '{"outcome": "conflict"}'::jsonb, 'F: a stale expected stamp for A gives conflict');
SELECT is(pg_temp.gs_save('50', 'a', 'v2', '2026-09-28 11:00:00+00',
                          pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00', 'b', NULL)),
  '{"outcome": "conflict"}'::jsonb, 'F: expecting a row for B that does not exist gives conflict');
SELECT is(pg_temp.gs_save('50', 'a', 'v2', '2026-09-28 11:00:00+00',
                          pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00', 'c', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "conflict"}'::jsonb, 'F: a key for a non-member gives conflict');
SELECT is(pg_temp.gs_rows('gs099-50'), 'A=v1|f-v1|submitted|10:00:00.000000|50',
  'F: A unchanged and no row added');

-- ---------------------------------------------------------------------------
-- G — non-advancing stamp (A, B v1 at T1; former member C's row at T3)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.gs_save('60', 'a', 'v2', '2026-09-28 12:00:00+00',
                          pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00', 'b', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "conflict"}'::jsonb, 'G: a stamp equal to the group max gives conflict');
SELECT is(pg_temp.gs_save('60', 'a', 'v2', '2026-09-28 11:00:00+00',
                          pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00', 'b', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "conflict"}'::jsonb, 'G: a stamp behind a former member''s row of the group gives conflict');
SELECT is(pg_temp.gs_save('60', 'a', 'v2', '2026-09-28 09:00:00+00',
                          pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00', 'b', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "conflict"}'::jsonb, 'G: a stamp older than the members'' rows gives conflict');
SELECT is(pg_temp.gs_rows('gs099-60'),
  'A=v1|f-v1|submitted|10:00:00.000000|60 B=v1|f-v1|submitted|10:00:00.000000|60 C=v0|f-v0|submitted|12:00:00.000000|60',
  'G: no row changed');

-- ---------------------------------------------------------------------------
-- H — forbidden (group 70: A has v1 at T1)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.gs_save('70', 'c', 'v2', '2026-09-28 11:00:00+00', pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "forbidden"}'::jsonb, 'H: an actor who is not a member gets forbidden');
SELECT is(pg_temp.gs_save('70', 'none', 'v2', '2026-09-28 11:00:00+00', pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00')),
  '{"outcome": "forbidden"}'::jsonb, 'H: a NULL actor gets forbidden');
SELECT is(pg_temp.gs_save('70', 'a', 'v2', '2026-09-28 11:00:00+00', '{}', 'gs099-71'),
  '{"outcome": "forbidden"}'::jsonb, 'H: a group paired with another assignment gets forbidden');
SELECT is(pg_temp.gs_save('79', 'a', 'v2', '2026-09-28 11:00:00+00', '{}'),
  '{"outcome": "forbidden"}'::jsonb, 'H: an unknown group gets forbidden');
SELECT is(pg_temp.gs_rows('gs099-70'), 'A=v1|f-v1|submitted|10:00:00.000000|70',
  'H: group 70 rows unchanged');
SELECT is(pg_temp.gs_rows('gs099-71') || pg_temp.gs_rows('gs099-79'), '',
  'H: no row was added for the mismatched or unknown group');

-- ---------------------------------------------------------------------------
-- I — browser roles cannot execute it (group 80: A has v1 at T1)
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('gs099_a');
SELECT throws_ok(
  format($$SELECT public.save_group_submission('gs099-80', %L::uuid, %L::uuid, 'v2', NULL, '2026-09-28 11:00:00+00', %L::jsonb)$$,
         '99000000-0000-4000-8000-000000000080', current_setting('gs.a'),
         jsonb_build_object(current_setting('gs.a'), '2026-09-28T10:00:00+00:00')),
  '42501', 'permission denied for function save_group_submission',
  'I: an authenticated member cannot execute it');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  format($$SELECT public.save_group_submission('gs099-80', %L::uuid, %L::uuid, 'v2', NULL, '2026-09-28 11:00:00+00', '{}'::jsonb)$$,
         '99000000-0000-4000-8000-000000000080', current_setting('gs.a')),
  '42501', 'permission denied for function save_group_submission',
  'I: anon cannot execute it');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.gs_rows('gs099-80'), 'A=v1|f-v1|submitted|10:00:00.000000|80',
  'I: group 80 rows unchanged');

-- ---------------------------------------------------------------------------
-- J — invalid input (service_role, group 80)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok($$SELECT pg_temp.gs_save('80', 'a', 'v2', NULL, pg_temp.gs_exp('a', '2026-09-28T10:00:00+00:00'))$$,
  '22023', NULL, 'J: a NULL p_submitted_at raises 22023');
SELECT throws_ok($$SELECT pg_temp.gs_save('80', 'a', 'v2', '2026-09-28 11:00:00+00', '[]')$$,
  '22023', NULL, 'J: an array p_expected raises 22023');
SELECT throws_ok($$SELECT pg_temp.gs_save('80', 'a', 'v2', '2026-09-28 11:00:00+00', NULL)$$,
  '22023', NULL, 'J: a NULL p_expected raises 22023');
RESET ROLE;
SELECT is(pg_temp.gs_rows('gs099-80'), 'A=v1|f-v1|submitted|10:00:00.000000|80',
  'J: group 80 rows unchanged');

-- ---------------------------------------------------------------------------
-- K — RLS unchanged
-- ---------------------------------------------------------------------------
SELECT tests.rls_enabled('public', 'group_assignment_groups');
SELECT tests.rls_enabled('public', 'group_assignment_members');
SELECT tests.rls_enabled('public', 'group_assignment_submissions');

SELECT * FROM finish();
ROLLBACK;
