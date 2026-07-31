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

SELECT plan(50);

-- =============================================================================
-- A. Schema / grants / RLS isolation (20 asserts)
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

SELECT * FROM finish();

ROLLBACK;
