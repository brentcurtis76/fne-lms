-- =============================================================================
-- 002-zoom-internal-isolation.sql — Z1b: zoom_internal denial + job queue
--
-- Proves the §6 access mechanics: the schema is EXPOSED to PostgREST (config)
-- but DENIED by grants — anon/authenticated hold zero privileges on the
-- schema, its tables, and the job RPCs; RLS-with-zero-policies is enabled on
-- every table as belt-and-braces. Then exercises the job-queue contract the
-- chunk-3 workers build on, and the §9 host-concurrency EXCLUDE constraint.
--
-- NOTE on "concurrent-style" claims: pgTAP runs on a single connection, so
-- true SKIP LOCKED contention (two sessions racing) cannot be reproduced
-- here — these asserts prove the state-machine half (a leased job is never
-- handed to a second claimer). The two-connection overlapping-ticker test is
-- a chunk-3 vitest requirement (plan §17).
--
-- Whole file runs in a transaction and rolls back — fixtures are transient.
-- =============================================================================

BEGIN;

SELECT plan(119);

-- =============================================================================
-- A. Schema / grants / RLS isolation (38 asserts)
--
-- The count above is maintained by hand and had gone stale: it still said 20
-- after Z1b-sol5 added 6 provisioning-RPC privilege asserts (Sol R6 ④). 26 was
-- the truth at sol5; Z1b-sol6 adds 3 more for the projection-sync signature.
-- =============================================================================

SELECT is(has_schema_privilege('anon', 'zoom_internal', 'USAGE'), false,
  'anon has no USAGE on zoom_internal');
SELECT is(has_schema_privilege('authenticated', 'zoom_internal', 'USAGE'), false,
  'authenticated has no USAGE on zoom_internal');
SELECT is(has_schema_privilege('anon', 'zoom_internal', 'CREATE'), false,
  'anon has no CREATE on zoom_internal');
SELECT is(has_schema_privilege('authenticated', 'zoom_internal', 'CREATE'), false,
  'authenticated has no CREATE on zoom_internal');

SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema = 'zoom_internal' AND grantee = 'anon'),
  0, 'zero table grants for anon on zoom_internal tables');
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema = 'zoom_internal' AND grantee = 'authenticated'),
  0, 'zero table grants for authenticated on zoom_internal tables');

SELECT tests.rls_enabled('zoom_internal');

SELECT is(
  (SELECT count(*)::int FROM pg_class pc
     JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE pn.nspname = 'zoom_internal' AND pc.relkind = 'r'),
  7, 'zoom_internal holds exactly the 7 Z1b tables (RLS check above is not vacuous)');

-- Job RPCs: EXECUTE revoked from anon/authenticated, granted to service_role
SELECT is(has_function_privilege('anon',
  'zoom_internal.claim_zoom_jobs(text, text[], integer, integer)', 'EXECUTE'), false,
  'anon cannot execute claim_zoom_jobs');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.claim_zoom_jobs(text, text[], integer, integer)', 'EXECUTE'), false,
  'authenticated cannot execute claim_zoom_jobs');
SELECT is(has_function_privilege('anon',
  'zoom_internal.heartbeat_zoom_job(uuid, text, integer, jsonb)', 'EXECUTE'), false,
  'anon cannot execute heartbeat_zoom_job');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.heartbeat_zoom_job(uuid, text, integer, jsonb)', 'EXECUTE'), false,
  'authenticated cannot execute heartbeat_zoom_job');
SELECT is(has_function_privilege('anon',
  'zoom_internal.complete_zoom_job(uuid, text, jsonb)', 'EXECUTE'), false,
  'anon cannot execute complete_zoom_job');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.complete_zoom_job(uuid, text, jsonb)', 'EXECUTE'), false,
  'authenticated cannot execute complete_zoom_job');
SELECT is(has_function_privilege('anon',
  'zoom_internal.fail_zoom_job(uuid, text, text, boolean, integer)', 'EXECUTE'), false,
  'anon cannot execute fail_zoom_job');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.fail_zoom_job(uuid, text, text, boolean, integer)', 'EXECUTE'), false,
  'authenticated cannot execute fail_zoom_job');

SELECT is(has_function_privilege('service_role',
  'zoom_internal.claim_zoom_jobs(text, text[], integer, integer)', 'EXECUTE'), true,
  'service_role can execute claim_zoom_jobs');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.heartbeat_zoom_job(uuid, text, integer, jsonb)', 'EXECUTE'), true,
  'service_role can execute heartbeat_zoom_job');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.complete_zoom_job(uuid, text, jsonb)', 'EXECUTE'), true,
  'service_role can execute complete_zoom_job');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.fail_zoom_job(uuid, text, text, boolean, integer)', 'EXECUTE'), true,
  'service_role can execute fail_zoom_job');

-- Atomic provisioning RPCs: denial and service-role access BY SIGNATURE.
SELECT is(has_function_privilege('anon',
  'zoom_internal.recover_provisioned_meeting(uuid, bigint, text, text, jsonb, uuid)',
  'EXECUTE'), false, 'anon cannot execute recover_provisioned_meeting');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.recover_provisioned_meeting(uuid, bigint, text, text, jsonb, uuid)',
  'EXECUTE'), false, 'authenticated cannot execute recover_provisioned_meeting');
SELECT is(has_function_privilege('anon',
  'zoom_internal.adopt_checkpoint_meeting(uuid, bigint, text, text, jsonb, uuid)',
  'EXECUTE'), false, 'anon cannot execute adopt_checkpoint_meeting');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.adopt_checkpoint_meeting(uuid, bigint, text, text, jsonb, uuid)',
  'EXECUTE'), false, 'authenticated cannot execute adopt_checkpoint_meeting');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.recover_provisioned_meeting(uuid, bigint, text, text, jsonb, uuid)',
  'EXECUTE'), true, 'service_role can execute recover_provisioned_meeting');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.adopt_checkpoint_meeting(uuid, bigint, text, text, jsonb, uuid)',
  'EXECUTE'), true, 'service_role can execute adopt_checkpoint_meeting');

-- Z1b-sol6: the projection-sync signature is subject to the same boundary. It
-- writes a PUBLIC table from a SECURITY DEFINER body, so an accidental grant here
-- would hand `authenticated` a way to rewrite meeting badges.
SELECT is(has_function_privilege('anon',
  'zoom_internal.sync_projection_from_meeting(uuid, uuid)',
  'EXECUTE'), false, 'anon cannot execute sync_projection_from_meeting');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.sync_projection_from_meeting(uuid, uuid)',
  'EXECUTE'), false, 'authenticated cannot execute sync_projection_from_meeting');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.sync_projection_from_meeting(uuid, uuid)',
  'EXECUTE'), true, 'service_role can execute sync_projection_from_meeting');

-- -----------------------------------------------------------------------------
-- Z2-4d: dial_in_numbers lives INSIDE this isolation proof, and the two RPCs that
-- populate it were amended IN PLACE (9 asserts).
--
-- The column carries no secret by itself, but a dial-in is only usable together with
-- the meeting number and the passcode, which is why it sits on this side of the
-- schema — so it must be covered by the same denial the rest of the table is.
--
-- The identity-argument asserts are the load-bearing ones: this round amended both
-- functions with CREATE OR REPLACE, and an accidental 7th parameter would have made a
-- NEW function, leaving the six positional calls in section D ambiguous while the
-- signature-based grant asserts above kept passing against a stale definition that
-- silently wrote NULL forever.
-- -----------------------------------------------------------------------------

SELECT has_column('zoom_internal', 'zoom_meetings', 'dial_in_numbers',
  'zoom_meetings.dial_in_numbers exists');
SELECT col_type_is('zoom_internal', 'zoom_meetings', 'dial_in_numbers', 'jsonb',
  'zoom_meetings.dial_in_numbers is jsonb — it holds Zoom''s array verbatim');
SELECT col_is_null('zoom_internal', 'zoom_meetings', 'dial_in_numbers',
  'zoom_meetings.dial_in_numbers is nullable — a tenant with no audio plan still provisions');

SELECT is(has_column_privilege('anon',
  'zoom_internal.zoom_meetings', 'dial_in_numbers', 'SELECT'), false,
  'anon cannot read zoom_meetings.dial_in_numbers');
SELECT is(has_column_privilege('authenticated',
  'zoom_internal.zoom_meetings', 'dial_in_numbers', 'SELECT'), false,
  'authenticated cannot read zoom_meetings.dial_in_numbers');

SELECT is(
  (SELECT oidvectortypes(p.proargtypes)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal' AND p.proname = 'recover_provisioned_meeting'),
  'uuid, bigint, text, text, jsonb, uuid',
  'recover_provisioned_meeting still has exactly the 6-argument identity');
SELECT is(
  (SELECT oidvectortypes(p.proargtypes)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal' AND p.proname = 'adopt_checkpoint_meeting'),
  'uuid, bigint, text, text, jsonb, uuid',
  'adopt_checkpoint_meeting still has exactly the 6-argument identity');

-- ...and exactly ONE definition each: an overload would satisfy the asserts above
-- through the surviving row while making section D's positional calls ambiguous.
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal'
      AND p.proname IN ('recover_provisioned_meeting', 'adopt_checkpoint_meeting')),
  2, 'the two provisioning RPCs have no overloads (CREATE OR REPLACE, never a new signature)');

-- The Z2-4d boundary, asserted at schema level so a later round cannot quietly cross
-- it: dial-in data NEVER reaches the student-readable projection. Matched by pattern,
-- not by exact name, so a differently-named crossing is caught too.
SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'session_meetings_public'
      AND column_name ILIKE '%dial%'),
  0, 'session_meetings_public exposes no dial-in column (Z2-4d ruling 1)');

-- =============================================================================
-- B. Job-queue behavior (26 asserts). Fixtures use dedicated job_types so the
-- claims here can never touch other sections' rows.
-- =============================================================================

INSERT INTO zoom_internal.zoom_jobs (id, job_type, run_after, dedupe_key) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'zt_a', now() - interval '2 min', 'zt-a-1'),
  ('dddddddd-0000-0000-0000-000000000002', 'zt_a', now() - interval '1 min', 'zt-a-2');

-- Claim 1 (worker w1): gets exactly the earliest runnable zt_a job
CREATE TEMP TABLE _claim1 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('w1', ARRAY['zt_a'], 1, 300);

SELECT is((SELECT count(*)::int FROM _claim1), 1,
  'claim leases exactly max_n jobs');
SELECT is((SELECT id FROM _claim1),
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  'claim returns the earliest run_after job first');
SELECT is(
  (SELECT (status, worker_id)::text FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000001'),
  '(leased,w1)',
  'claimed job is leased to the claiming worker');

-- Claim 2 (worker w2): a leased job can NEVER be handed to a second claimer
CREATE TEMP TABLE _claim2 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('w2', ARRAY['zt_a'], 10, 300);

SELECT is((SELECT count(*)::int FROM _claim2), 1,
  'second claim gets only the remaining job — never the already-leased one');
SELECT is((SELECT id FROM _claim2),
  'dddddddd-0000-0000-0000-000000000002'::uuid,
  'second claim leased the other pending job');
SELECT is(
  (SELECT worker_id FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000001'),
  'w1',
  'first job still belongs to worker w1 after the second claim');

-- Expired lease is reclaimable, and the lost lease counts as one attempt
UPDATE zoom_internal.zoom_jobs
   SET lease_expires_at = now() - interval '1 sec'
 WHERE id = 'dddddddd-0000-0000-0000-000000000001';

CREATE TEMP TABLE _claim3 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('w2', ARRAY['zt_a'], 1, 300);

SELECT is((SELECT id FROM _claim3),
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  'expired lease is reclaimable by the next claim');
SELECT is((SELECT attempts FROM _claim3), 1,
  'reclaiming an expired lease counts the lost lease as one attempt');

-- Heartbeat: only the owning worker, only while the lease is live
UPDATE zoom_internal.zoom_jobs
   SET lease_expires_at = now() + interval '10 sec'
 WHERE id = 'dddddddd-0000-0000-0000-000000000002';

SELECT is(zoom_internal.heartbeat_zoom_job(
  'dddddddd-0000-0000-0000-000000000002', 'w1'), false,
  'heartbeat from a non-owning worker returns false');
SELECT is(zoom_internal.heartbeat_zoom_job(
  'dddddddd-0000-0000-0000-000000000002', 'w2', 300), true,
  'heartbeat from the owning worker returns true');
SELECT ok(
  (SELECT lease_expires_at > now() + interval '200 sec'
     FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000002'),
  'heartbeat extended the lease');

-- Complete
SELECT is(zoom_internal.complete_zoom_job(
  'dddddddd-0000-0000-0000-000000000002', 'w2'), true,
  'complete from the owning worker returns true');
SELECT is(
  (SELECT status FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000002'),
  'done',
  'completed job lands in done');

-- Fail path: retry with backoff, then attempts exhaustion lands dead
INSERT INTO zoom_internal.zoom_jobs (id, job_type, max_attempts, run_after)
VALUES ('dddddddd-0000-0000-0000-000000000003', 'zt_b', 2, now() - interval '1 min');

CREATE TEMP TABLE _claimb1 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('wB', ARRAY['zt_b'], 1, 300);

SELECT is(zoom_internal.fail_zoom_job(
  'dddddddd-0000-0000-0000-000000000003', 'wB', 'boom 1'), 'pending',
  'first fail below max_attempts requeues as pending');
SELECT is(
  (SELECT attempts FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000003'),
  1, 'fail incremented attempts');
SELECT ok(
  (SELECT run_after > now() FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000003'),
  'requeued job carries a backoff run_after in the future');

UPDATE zoom_internal.zoom_jobs
   SET run_after = now() - interval '1 sec'
 WHERE id = 'dddddddd-0000-0000-0000-000000000003';

CREATE TEMP TABLE _claimb2 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('wB', ARRAY['zt_b'], 1, 300);

SELECT is(zoom_internal.fail_zoom_job(
  'dddddddd-0000-0000-0000-000000000003', 'wB', 'boom 2'), 'dead',
  'fail at attempts >= max_attempts lands dead');
SELECT is(
  (SELECT (status, attempts)::text FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000003'),
  '(dead,2)',
  'dead job records the exhausted attempt count');

-- Sol F2: the backoff schedule, and the Retry-After hint as a FLOOR under it.
-- Asserted AS service_role, so these also prove the grant on the new signature is
-- what the runner actually calls through.
INSERT INTO zoom_internal.zoom_jobs (id, job_type, max_attempts, run_after)
VALUES ('dddddddd-0000-0000-0000-000000000005', 'zt_d', 5, now() - interval '1 min'),
       ('dddddddd-0000-0000-0000-000000000006', 'zt_d', 5, now() - interval '1 min');

SET LOCAL ROLE service_role;

CREATE TEMP TABLE _claimd AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('wD', ARRAY['zt_d'], 2, 300);

-- (a) No hint ⇒ the unchanged 30 s first backoff.
SELECT is(zoom_internal.fail_zoom_job(
  'dddddddd-0000-0000-0000-000000000005', 'wD', 'unhinted'), 'pending',
  'unhinted retryable fail requeues as pending');
SELECT ok(
  (SELECT run_after BETWEEN now() + interval '25 sec' AND now() + interval '35 sec'
     FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000005'),
  'unhinted first backoff schedules at ~30 s (GREATEST(backoff, 0) = backoff)');

-- (b) A 600 s hint ⇒ run_after is at least 600 s out, not the 30 s backoff.
SELECT is(zoom_internal.fail_zoom_job(
  'dddddddd-0000-0000-0000-000000000006', 'wD', 'rate limited', true, 600), 'pending',
  'hinted retryable fail requeues as pending');
SELECT ok(
  (SELECT run_after >= now() + interval '600 sec'
     FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000006'),
  'a 600 s Retry-After hint floors run_after at 600 s, not the 30 s backoff');

-- (c) A hint SMALLER than the backoff must not shorten it — GREATEST, not override.
UPDATE zoom_internal.zoom_jobs
   SET run_after = now() - interval '1 sec'
 WHERE id = 'dddddddd-0000-0000-0000-000000000006';

CREATE TEMP TABLE _claimd2 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('wD', ARRAY['zt_d'], 1, 300);

SELECT is(zoom_internal.fail_zoom_job(
  'dddddddd-0000-0000-0000-000000000006', 'wD', 'tiny hint', true, 5), 'pending',
  'second hinted fail still requeues as pending');
SELECT ok(
  (SELECT run_after >= now() + interval '55 sec'
     FROM zoom_internal.zoom_jobs
    WHERE id = 'dddddddd-0000-0000-0000-000000000006'),
  'a 5 s hint cannot shorten the 60 s second backoff');

RESET ROLE;

-- Non-retryable fail is terminal 'failed'
INSERT INTO zoom_internal.zoom_jobs (id, job_type, run_after)
VALUES ('dddddddd-0000-0000-0000-000000000004', 'zt_c', now() - interval '1 min');

CREATE TEMP TABLE _claimc1 AS
  SELECT * FROM zoom_internal.claim_zoom_jobs('wC', ARRAY['zt_c'], 1, 300);

SELECT is(zoom_internal.fail_zoom_job(
  'dddddddd-0000-0000-0000-000000000004', 'wC', 'fatal', false), 'failed',
  'non-retryable fail lands terminal failed');

-- Dedupe: duplicate enqueue on the same dedupe_key rejects
SELECT throws_ok(
  $$ INSERT INTO zoom_internal.zoom_jobs (job_type, dedupe_key)
     VALUES ('zt_a', 'zt-a-1') $$,
  '23505',
  NULL,
  'duplicate dedupe_key enqueue rejects with unique_violation');

-- =============================================================================
-- C. §9 host-concurrency EXCLUDE constraint (4 asserts): the insert IS the
-- reservation; 23P01 = host busy; only ACTIVE statuses reserve.
-- =============================================================================

INSERT INTO public.schools (id, name) VALUES (9901, 'Zoom RLS Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zoom_internal.zoom_hosts (zoom_user_id, email, org_owned)
VALUES ('zhost_1', 'pool1@test.local', true);

INSERT INTO zoom_internal.zoom_meetings
  (id, surface_type, surface_id, school_id, host_zoom_user_id, status, starts_at, duration_minutes)
VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'consultor_session',
   'eeeeeeee-1111-0000-0000-000000000001', 9901, 'zhost_1', 'provisioned',
   now(), 60);

-- Overlap inside the −15/+45 buffer → host busy
SELECT throws_ok(
  $$ INSERT INTO zoom_internal.zoom_meetings
       (surface_type, surface_id, school_id, host_zoom_user_id, status, starts_at, duration_minutes)
     VALUES ('consultor_session', 'eeeeeeee-1111-0000-0000-000000000002', 9901,
             'zhost_1', 'pending', now() + interval '30 min', 30) $$,
  '23P01',
  NULL,
  'overlapping active meeting on the same host raises 23P01 (host busy)');

-- Beyond the buffer (start >= prior start + 120 min) → fits
SELECT lives_ok(
  $$ INSERT INTO zoom_internal.zoom_meetings
       (surface_type, surface_id, school_id, host_zoom_user_id, status, starts_at, duration_minutes)
     VALUES ('consultor_session', 'eeeeeeee-1111-0000-0000-000000000003', 9901,
             'zhost_1', 'pending', now() + interval '121 min', 30) $$,
  'non-overlapping meeting on the same host inserts cleanly');

-- Inactive statuses release the reservation
UPDATE zoom_internal.zoom_meetings
   SET status = 'cancelled'
 WHERE id = 'eeeeeeee-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ INSERT INTO zoom_internal.zoom_meetings
       (surface_type, surface_id, school_id, host_zoom_user_id, status, starts_at, duration_minutes)
     VALUES ('consultor_session', 'eeeeeeee-1111-0000-0000-000000000004', 9901,
             'zhost_1', 'pending', now(), 60) $$,
  'cancelled meeting no longer reserves the host (partial WHERE releases the slot)');

-- NULL host (pre-assignment) never conflicts
SELECT lives_ok(
  $$ INSERT INTO zoom_internal.zoom_meetings
       (surface_type, surface_id, school_id, host_zoom_user_id, status, starts_at, duration_minutes)
     VALUES
       ('consultor_session', 'eeeeeeee-1111-0000-0000-000000000005', 9901, NULL, 'pending', now(), 60),
       ('consultor_session', 'eeeeeeee-1111-0000-0000-000000000006', 9901, NULL, 'pending', now(), 60) $$,
  'meetings without an assigned host never conflict (reservation starts at assignment)');

-- =============================================================================
-- D. Atomic provision transitions (24 asserts). These are behavior tests because
-- the CAS filters moved from the TypeScript/PostgREST wire into SQL in sol5.
-- Calls run AS service_role, matching the production client and proving the grants.
-- =============================================================================

INSERT INTO zoom_internal.zoom_meetings
  (id, surface_type, surface_id, school_id, zoom_meeting_number, status,
   starts_at, duration_minutes, last_error)
VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000001', 9901, 82000001001, 'pending',
   '2026-09-01T14:00:00Z', 60, '{"reason":"ambiguous_create_outcome"}'),
  ('ffffffff-0000-0000-0000-000000000002', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000002', 9901, 82000001002, 'pending',
   '2026-09-02T14:00:00Z', 60, 'untouched-marker'),
  ('ffffffff-0000-0000-0000-000000000003', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000003', 9901, 82000001003, 'pending',
   '2026-09-03T14:00:00Z', 60, 'backward-marker'),
  ('ffffffff-0000-0000-0000-000000000004', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000004', 9901, NULL, 'pending',
   '2026-09-04T14:00:00Z', 60, 'checkpoint-marker'),
  ('ffffffff-0000-0000-0000-000000000005', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000005', 9901, 82000001005, 'pending',
   '2026-09-05T14:00:00Z', 60, 'adopt-miss-marker'),
  ('ffffffff-0000-0000-0000-000000000006', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000006', 9901, NULL, 'pending',
   '2026-09-06T14:00:00Z', 60, 'adopt-backward-marker'),
  -- Z2-4d: one row per RPC path for the dial-in capture. Both paths were amended, so
  -- both are exercised; the rows above carry NO dial-in key and are the no-audio-plan
  -- half of the same proof.
  ('ffffffff-0000-0000-0000-000000000007', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000007', 9901, 82000001007, 'pending',
   '2026-09-07T14:00:00Z', 60, 'dialin-recover-marker'),
  ('ffffffff-0000-0000-0000-000000000008', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000008', 9901, NULL, 'pending',
   '2026-09-08T14:00:00Z', 60, 'dialin-adopt-marker');

INSERT INTO public.session_meetings_public
  (surface_type, surface_id, school_id, meeting_status, starts_at, ends_at)
VALUES
  ('consultor_session', 'ffffffff-1111-0000-0000-000000000003', 9901,
   'ended', '2001-01-01T00:00:00Z', '2001-01-01T01:00:00Z'),
  ('consultor_session', 'ffffffff-1111-0000-0000-000000000006', 9901,
   'live', '2002-01-01T00:00:00Z', '2002-01-01T01:00:00Z');

SET LOCAL ROLE service_role;

-- Recovery success: the row and projection become visible together.
SELECT is(zoom_internal.recover_provisioned_meeting(
  'ffffffff-0000-0000-0000-000000000001', 82000001001, 'recover11',
  'https://example-synthetic.test/j/82000001001', '{"auto_recording":"none"}', NULL),
  true, 'recovery CAS applies exactly once');
SELECT ok((SELECT status = 'provisioned'
                  AND passcode = 'recover11'
                  AND join_url = 'https://example-synthetic.test/j/82000001001'
                  AND effective_settings ->> 'auto_recording' = 'none'
                  AND last_error IS NULL
             FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000001'),
  'recovery writes the complete provisioned row and clears last_error');
SELECT ok((SELECT meeting_status = 'scheduled'
                  AND starts_at = '2026-09-01T14:00:00Z'::timestamptz
                  AND ends_at = '2026-09-01T15:00:00Z'::timestamptz
             FROM public.session_meetings_public
            WHERE surface_id = 'ffffffff-1111-0000-0000-000000000001'),
  'recovery publishes the scheduled projection in the same call');

-- Recovery miss: wrong recorded number means neither table changes.
SELECT is(zoom_internal.recover_provisioned_meeting(
  'ffffffff-0000-0000-0000-000000000002', 82000001999, 'must-not-land',
  'https://example-synthetic.test/j/must-not-land', '{"auto_recording":"cloud"}', NULL),
  false, 'recovery CAS miss returns false');
SELECT ok((SELECT status = 'pending'
                  AND zoom_meeting_number = 82000001002
                  AND passcode IS NULL
                  AND last_error = 'untouched-marker'
             FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000002'),
  'recovery miss leaves the internal row untouched');
SELECT is((SELECT count(*)::int FROM public.session_meetings_public
            WHERE surface_id = 'ffffffff-1111-0000-0000-000000000002'),
  0, 'recovery miss publishes no projection');

-- Recovery backward guard: an ended projection is never reset to scheduled.
SELECT is(zoom_internal.recover_provisioned_meeting(
  'ffffffff-0000-0000-0000-000000000003', 82000001003, 'recover33',
  'https://example-synthetic.test/j/82000001003', '{"auto_recording":"none"}', NULL),
  true, 'recovery can resolve the internal row when a later projection already exists');
SELECT is((SELECT status FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000003'),
  'provisioned', 'recovery backward-guard case still completes the internal transition');
SELECT ok((SELECT meeting_status = 'ended'
                  AND starts_at = '2001-01-01T00:00:00Z'::timestamptz
             FROM public.session_meetings_public
            WHERE surface_id = 'ffffffff-1111-0000-0000-000000000003'),
  'recovery never moves an ended projection backward or rewrites its window');

-- Adoption success: pending + NULL number is adopted and projected atomically.
SELECT is(zoom_internal.adopt_checkpoint_meeting(
  'ffffffff-0000-0000-0000-000000000004', 82000001004, 'adopt444',
  'https://example-synthetic.test/j/82000001004', '{"auto_recording":"none"}', NULL),
  true, 'checkpoint adoption CAS applies exactly once');
SELECT ok((SELECT status = 'provisioned'
                  AND zoom_meeting_number = 82000001004
                  AND passcode = 'adopt444'
                  AND last_error IS NULL
             FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000004'),
  'adoption writes the complete provisioned row and clears last_error');
SELECT is((SELECT meeting_status FROM public.session_meetings_public
            WHERE surface_id = 'ffffffff-1111-0000-0000-000000000004'),
  'scheduled', 'adoption publishes the scheduled projection in the same call');

-- Adoption miss: a number already recorded fails the IS NULL guard.
SELECT is(zoom_internal.adopt_checkpoint_meeting(
  'ffffffff-0000-0000-0000-000000000005', 82000001995, 'must-not-land',
  'https://example-synthetic.test/j/must-not-land', '{"auto_recording":"cloud"}', NULL),
  false, 'checkpoint adoption CAS miss returns false');
SELECT ok((SELECT status = 'pending'
                  AND zoom_meeting_number = 82000001005
                  AND passcode IS NULL
                  AND last_error = 'adopt-miss-marker'
             FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000005'),
  'adoption miss leaves the internal row untouched');
SELECT is((SELECT count(*)::int FROM public.session_meetings_public
            WHERE surface_id = 'ffffffff-1111-0000-0000-000000000005'),
  0, 'adoption miss publishes no projection');

-- Adoption backward guard mirrors recovery: a live projection stays live.
SELECT is(zoom_internal.adopt_checkpoint_meeting(
  'ffffffff-0000-0000-0000-000000000006', 82000001006, 'adopt666',
  'https://example-synthetic.test/j/82000001006', '{"auto_recording":"none"}', NULL),
  true, 'adoption can complete when a later projection already exists');
SELECT is((SELECT status FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000006'),
  'provisioned', 'adoption backward-guard case completes the internal transition');
SELECT ok((SELECT meeting_status = 'live'
                  AND starts_at = '2002-01-01T00:00:00Z'::timestamptz
             FROM public.session_meetings_public
            WHERE surface_id = 'ffffffff-1111-0000-0000-000000000006'),
  'adoption never moves a live projection backward or rewrites its window');

-- -----------------------------------------------------------------------------
-- Z2-4d: the dial-in set is captured by BOTH amended RPCs, and its absence is not an
-- error (6 asserts). Read back off the row — asserting the call returned true would
-- prove nothing about the column.
--
-- The synthetic numbers below are `+56 2 5555 xxxx`, inside Chile's reserved-for-
-- fiction 55xx block. Never put a real phone number in a fixture.
-- -----------------------------------------------------------------------------

SELECT is(zoom_internal.recover_provisioned_meeting(
  'ffffffff-0000-0000-0000-000000000007', 82000001007, 'recover77',
  'https://example-synthetic.test/j/82000001007',
  '{"auto_recording":"none","global_dial_in_numbers":[{"country":"CL","country_name":"Chile","city":"Santiago","number":"+56 2 5555 0100","type":"toll"}]}',
  NULL),
  true, 'recovery applies for an audio-plan tenant');
SELECT is(
  (SELECT dial_in_numbers FROM zoom_internal.zoom_meetings
    WHERE id = 'ffffffff-0000-0000-0000-000000000007'),
  '[{"country":"CL","country_name":"Chile","city":"Santiago","number":"+56 2 5555 0100","type":"toll"}]'::jsonb,
  'recovery captures global_dial_in_numbers into dial_in_numbers');

SELECT is(zoom_internal.adopt_checkpoint_meeting(
  'ffffffff-0000-0000-0000-000000000008', 82000001008, 'adopt888',
  'https://example-synthetic.test/j/82000001008',
  '{"auto_recording":"none","global_dial_in_numbers":[{"country":"CL","country_name":"Chile","city":"Valparaíso","number":"+56 32 5555 0101","type":"toll"}]}',
  NULL),
  true, 'adoption applies for an audio-plan tenant');
SELECT is(
  (SELECT dial_in_numbers FROM zoom_internal.zoom_meetings
    WHERE id = 'ffffffff-0000-0000-0000-000000000008'),
  '[{"country":"CL","country_name":"Chile","city":"Valparaíso","number":"+56 32 5555 0101","type":"toll"}]'::jsonb,
  'adoption captures global_dial_in_numbers into dial_in_numbers');

-- No audio plan: Zoom omits the key, `->` yields NULL, and the row still provisioned
-- above. These read the rows the earlier asserts already drove to `provisioned`.
SELECT ok((SELECT status = 'provisioned' AND dial_in_numbers IS NULL
             FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000001'),
  'recovery without a dial-in key provisions with a NULL dial_in_numbers');
SELECT ok((SELECT status = 'provisioned' AND dial_in_numbers IS NULL
             FROM zoom_internal.zoom_meetings
            WHERE id = 'ffffffff-0000-0000-0000-000000000004'),
  'adoption without a dial-in key provisions with a NULL dial_in_numbers');

RESET ROLE;

-- =============================================================================
-- E. Projection sync DERIVED from the internal row (21 asserts; Z1b-sol6, Sol R6
-- ②). The replay path no longer asserts `scheduled` from TypeScript: the public
-- status is read off zoom_meetings under FOR UPDATE and applied only forward.
--
-- The guard mirrors `PROJECTION_LIVE_APPLIES_FROM` / `PROJECTION_ENDED_APPLIES_FROM`
-- in lib/zoom/webhook-store.ts. These asserts are what catches the two drifting
-- apart, since they cannot share code.
-- =============================================================================

INSERT INTO zoom_internal.zoom_meetings
  (id, surface_type, surface_id, school_id, zoom_meeting_number, status,
   starts_at, duration_minutes)
VALUES
  -- provisioned, no projection yet → publishes scheduled
  ('aaaaaaaa-0000-0000-0000-000000000001', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000001', 9901, 82000002001, 'provisioned',
   '2026-10-01T14:00:00Z', 60),
  -- started, projection still scheduled → advances to live
  ('aaaaaaaa-0000-0000-0000-000000000002', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000002', 9901, 82000002002, 'started',
   '2026-10-02T14:00:00Z', 60),
  -- ended, NO projection at all → the healing case, created at ended
  ('aaaaaaaa-0000-0000-0000-000000000003', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000003', 9901, 82000002003, 'ended',
   '2026-10-03T14:00:00Z', 60),
  -- provisioned, projection already ended → the finding: must NOT go back
  ('aaaaaaaa-0000-0000-0000-000000000004', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000004', 9901, 82000002004, 'provisioned',
   '2026-10-04T14:00:00Z', 60),
  -- started, projection cancelled → cancellation is terminal against live
  ('aaaaaaaa-0000-0000-0000-000000000005', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000005', 9901, 82000002005, 'started',
   '2026-10-05T14:00:00Z', 60),
  -- pending: nothing to announce
  ('aaaaaaaa-0000-0000-0000-000000000006', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000006', 9901, NULL, 'pending',
   '2026-10-06T14:00:00Z', 60),
  -- deleted over a live badge → cancelled
  ('aaaaaaaa-0000-0000-0000-000000000007', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000007', 9901, 82000002007, 'deleted',
   '2026-10-07T14:00:00Z', 60),
  -- cancelled over cancelled → idempotent, still applies
  ('aaaaaaaa-0000-0000-0000-000000000008', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000008', 9901, 82000002008, 'cancelled',
   '2026-10-08T14:00:00Z', 60),
  -- cancelled over ENDED → ended is terminal in this direction too
  ('aaaaaaaa-0000-0000-0000-000000000009', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000009', 9901, 82000002009, 'cancelled',
   '2026-10-09T14:00:00Z', 60),
  -- error: a row that never completed is not publishable either
  ('aaaaaaaa-0000-0000-0000-000000000010', 'consultor_session',
   'aaaaaaaa-1111-0000-0000-000000000010', 9901, 82000002010, 'error',
   '2026-10-10T14:00:00Z', 60);

INSERT INTO public.session_meetings_public
  (surface_type, surface_id, school_id, meeting_status, starts_at, ends_at)
VALUES
  ('consultor_session', 'aaaaaaaa-1111-0000-0000-000000000002', 9901,
   'scheduled', '2026-10-02T14:00:00Z', '2026-10-02T15:00:00Z'),
  ('consultor_session', 'aaaaaaaa-1111-0000-0000-000000000004', 9901,
   'ended', '2003-01-01T00:00:00Z', '2003-01-01T01:00:00Z'),
  ('consultor_session', 'aaaaaaaa-1111-0000-0000-000000000005', 9901,
   'cancelled', '2004-01-01T00:00:00Z', '2004-01-01T01:00:00Z'),
  ('consultor_session', 'aaaaaaaa-1111-0000-0000-000000000007', 9901,
   'live', '2005-01-01T00:00:00Z', '2005-01-01T01:00:00Z'),
  ('consultor_session', 'aaaaaaaa-1111-0000-0000-000000000008', 9901,
   'cancelled', '2006-01-01T00:00:00Z', '2006-01-01T01:00:00Z'),
  ('consultor_session', 'aaaaaaaa-1111-0000-0000-000000000009', 9901,
   'ended', '2007-01-01T00:00:00Z', '2007-01-01T01:00:00Z');

SET LOCAL ROLE service_role;

-- provisioned → scheduled, created from nothing.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000001', NULL),
  'published', 'sync publishes scheduled for a provisioned meeting');
SELECT ok((SELECT meeting_status = 'scheduled'
                  AND starts_at = '2026-10-01T14:00:00Z'::timestamptz
                  AND ends_at = '2026-10-01T15:00:00Z'::timestamptz
                  AND provider = 'zoom'
             FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  'sync takes the window off the row, not off a caller-supplied value');

-- started → live, over a scheduled badge.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000002', NULL),
  'published', 'sync advances a scheduled badge to live for a started meeting');
SELECT is((SELECT meeting_status FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000002'),
  'live', 'the derived status is live, never the hard-coded scheduled');

-- THE HEALING CASE: ended meeting, no projection row at all.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000003', NULL),
  'published', 'sync RECREATES a missing projection for an already-ended meeting');
SELECT ok((SELECT meeting_status = 'ended'
                  AND starts_at = '2026-10-03T14:00:00Z'::timestamptz
                  AND ends_at = '2026-10-03T15:00:00Z'::timestamptz
             FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000003'),
  'the recreated projection is ended — not a scheduled badge for a finished meeting');

-- THE FINDING: a late replay may never put an ended badge back to scheduled.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000004', NULL),
  'blocked', 'sync refuses to move an ended projection back to scheduled');
SELECT ok((SELECT meeting_status = 'ended'
                  AND starts_at = '2003-01-01T00:00:00Z'::timestamptz
             FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000004'),
  'the blocked sync rewrote neither the status nor the window');

-- cancelled is terminal against live.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000005', NULL),
  'blocked', 'sync refuses to reopen a cancelled projection as live');
SELECT is((SELECT meeting_status FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000005'),
  'cancelled', 'the cancelled badge survives a started meeting');

-- pending: nothing to publish, and nothing published.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000006', NULL),
  'not_publishable', 'a pending meeting yields a typed no-op');
SELECT is((SELECT count(*)::int FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000006'),
  0, 'the pending no-op creates no projection row');

-- deleted reads as cancelled to the UI, and cancellation beats live.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000007', NULL),
  'published', 'a deleted meeting publishes over a live badge');
SELECT is((SELECT meeting_status FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000007'),
  'cancelled', 'deleted maps to cancelled on the public projection');

-- cancelled over cancelled: idempotent, applies rather than blocks.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000008', NULL),
  'published', 'a repeated cancellation is idempotent, not a block');
SELECT is((SELECT meeting_status FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000008'),
  'cancelled', 'the repeated cancellation leaves the badge cancelled');

-- ...but ended is terminal in the other direction too.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000009', NULL),
  'blocked', 'sync refuses to cancel a projection that already ended');
SELECT is((SELECT meeting_status FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000009'),
  'ended', 'the ended badge survives a cancelled meeting row');

-- error: also not publishable.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-000000000010', NULL),
  'not_publishable', 'an errored meeting yields a typed no-op');
SELECT is((SELECT count(*)::int FROM public.session_meetings_public
            WHERE surface_id = 'aaaaaaaa-1111-0000-0000-000000000010'),
  0, 'the errored no-op creates no projection row');

-- A vanished row is reported, never guessed at.
SELECT is(zoom_internal.sync_projection_from_meeting(
  'aaaaaaaa-0000-0000-0000-0000000000ff', NULL),
  'missing', 'sync reports a missing internal row instead of publishing');

RESET ROLE;

-- =============================================================================
-- F. Z2-4e: the dial_in_numbers BACKFILL (6 asserts).
--
-- 20260807120000 is DML over rows that already existed, so on a fresh replay it
-- matches nothing and the replay proves only that it parses and applies. The three
-- outcomes it must have are asserted here against seeded fixtures.
--
-- WHAT RUNS BELOW IS THE MIGRATION ITSELF, not a copy of it (Sol item 10). Until r27
-- this section re-typed the migration's UPDATE, and a diff between the two proved
-- sameness rather than that the shipped file is what executes: edit one and not the
-- other and these asserts go on passing against a statement nobody deploys.
--
-- The mechanism is `supabase_migrations.schema_migrations.statements` — the statement
-- array the Supabase CLI recorded when it READ AND APPLIED the file. `supabase db
-- start` (CI gate 3) and `supabase db reset` (local) rebuild that row from
-- supabase/migrations on every run, so what executes here is regenerated from the file
-- and cannot be edited independently of it.
--
-- `\i` on the migration's own path was tried first and does not work in this harness:
-- `supabase test db` runs pg_prove in a container that bind-mounts ONLY the directory
-- of each path argument, so supabase/tests is present at its host path and
-- supabase/migrations is absent — `\ir ../migrations/<file>` resolves to the correct
-- absolute path and psql answers "No such file or directory". Passing the migration as
-- a second path argument does mount it, but pg_prove then also RUNS the migration as a
-- test file: it carries no plan, so the run fails, and it would apply outside any
-- transaction. The db container has no copy either — the CLI applies migrations over a
-- connection rather than mounting them.
--
-- Hosts are NULL so these fixtures cannot collide with section C's EXCLUDE constraint.
-- =============================================================================

-- The migration has to BE there. Without this, a renamed, reverted or unapplied
-- migration would leave the replay below with nothing to execute and every outcome
-- assert would still pass — the same blindness the hand-copy had.
SELECT is(
  (SELECT count(*)::int FROM supabase_migrations.schema_migrations
    WHERE version = '20260807120000'
      AND statements IS NOT NULL
      AND cardinality(statements) > 0),
  1, 'the Z2-4e backfill migration is recorded as applied, with statements to replay');

INSERT INTO zoom_internal.zoom_meetings
  (id, surface_type, surface_id, school_id, host_zoom_user_id, zoom_meeting_number,
   status, starts_at, duration_minutes, effective_settings, dial_in_numbers)
VALUES
  -- (a) the row the backfill exists for: numbers inside the blob, column still NULL
  ('bbbbbbbb-0000-0000-0000-000000000001', 'consultor_session',
   'bbbbbbbb-1111-0000-0000-000000000001', 9901, NULL, 82000003001, 'provisioned',
   '2026-11-01T14:00:00Z', 60,
   '{"auto_recording":"none","global_dial_in_numbers":[{"country":"CL","country_name":"Chile","city":"Santiago","number":"+56 2 5555 0120","type":"toll"}]}',
   NULL),
  -- (b) a row already named by the Z2-4d RPCs — must survive untouched
  ('bbbbbbbb-0000-0000-0000-000000000002', 'consultor_session',
   'bbbbbbbb-1111-0000-0000-000000000002', 9901, NULL, 82000003002, 'provisioned',
   '2026-11-02T14:00:00Z', 60,
   '{"auto_recording":"none","global_dial_in_numbers":[{"number":"+56 2 5555 0121"}]}',
   '[{"number":"+56 2 5555 0199"}]'),
  -- (c) a no-audio-plan row: Zoom omitted the key, so there is nothing to name
  ('bbbbbbbb-0000-0000-0000-000000000003', 'consultor_session',
   'bbbbbbbb-1111-0000-0000-000000000003', 9901, NULL, 82000003003, 'provisioned',
   '2026-11-03T14:00:00Z', 60,
   '{"auto_recording":"none"}',
   NULL),
  -- (d) a row with NO effective_settings at all — a numberless reservation is stored
  -- this way before its provisioner returns. The migration header claims `?` yields
  -- NULL here and therefore never matches; nothing asserted that until r27.
  ('bbbbbbbb-0000-0000-0000-000000000004', 'consultor_session',
   'bbbbbbbb-1111-0000-0000-000000000004', 9901, NULL, 82000003004, 'provisioned',
   '2026-11-04T14:00:00Z', 60,
   NULL,
   NULL);

-- Replays the recorded statements of 20260807120000, in order. Every statement, not
-- just the first: a migration that grows a second one must be replayed whole or this
-- section silently stops covering it.
CREATE OR REPLACE FUNCTION pg_temp.replay_backfill_z2_4e() RETURNS void
LANGUAGE plpgsql AS $replay$
DECLARE
  v_statement text;
BEGIN
  FOR v_statement IN
    SELECT unnest(statements)
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260807120000'
  LOOP
    EXECUTE v_statement;
  END LOOP;
END
$replay$;

SELECT pg_temp.replay_backfill_z2_4e();

SELECT is(
  (SELECT dial_in_numbers FROM zoom_internal.zoom_meetings
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '[{"country":"CL","country_name":"Chile","city":"Santiago","number":"+56 2 5555 0120","type":"toll"}]'::jsonb,
  'backfill names the dial-in set of a pre-Z2-4d row whose column was NULL');

SELECT is(
  (SELECT dial_in_numbers FROM zoom_internal.zoom_meetings
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  '[{"number":"+56 2 5555 0199"}]'::jsonb,
  'backfill never overwrites a dial_in_numbers that already has a value');

SELECT ok(
  (SELECT dial_in_numbers IS NULL FROM zoom_internal.zoom_meetings
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003'),
  'backfill leaves a row whose effective_settings lacks the key NULL, not JSON null');

SELECT ok(
  (SELECT dial_in_numbers IS NULL FROM zoom_internal.zoom_meetings
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000004'),
  'backfill leaves a row with NULL effective_settings alone — `?` on NULL never matches');

-- Idempotence, asserted on VALUES rather than on a matched-row count: running the real
-- migration a second time must leave all three fixtures exactly as the first run did.
-- A count-based check would pass for a statement that rewrote a row to the same value;
-- this one also catches a lost guard that re-derives (b) from its stale settings blob.
CREATE TEMP TABLE backfill_after_first_run AS
SELECT id, dial_in_numbers
  FROM zoom_internal.zoom_meetings
 WHERE id IN ('bbbbbbbb-0000-0000-0000-000000000001',
              'bbbbbbbb-0000-0000-0000-000000000002',
              'bbbbbbbb-0000-0000-0000-000000000003',
              'bbbbbbbb-0000-0000-0000-000000000004');

SELECT pg_temp.replay_backfill_z2_4e();

SELECT is(
  (SELECT count(*)::int
     FROM backfill_after_first_run f
     JOIN zoom_internal.zoom_meetings m USING (id)
    WHERE m.dial_in_numbers IS DISTINCT FROM f.dial_in_numbers),
  0, 'a second run of the real migration changes nothing — it is idempotent');

SELECT * FROM finish();

ROLLBACK;
