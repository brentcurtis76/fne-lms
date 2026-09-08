-- =============================================================================
-- 075-r4-remediation.sql — Codex re-review R4 (rls-rereview-r3-2026-09-07.md):
-- the corrections folded into 20260907120000 (R4-01) / 20260907120300 (R4-02),
-- reproduced failure by failure.
--
--   1. catalog: the heartbeat guard and the legacy-progress sync trigger are
--      installed; no application role may execute the internal helpers
--   2. R4-01 — the heartbeat is server-derived on EVERY write path: a direct
--      client UPDATE with 'infinity', a finite future value, a backdate or NULL
--      stores now(); RPC heartbeats/activity store now(); a backend writer may
--      backdate but is clamped to now(); INSERT is guarded too. Final
--      settlement after revocation (direct assignment removed / group
--      membership ended) closes at the stored (server) mark, never at the end
--      request; a PRE-GUARD future value (simulated with triggers bypassed)
--      establishes nothing: end credits up to the session start, maintenance
--      closes at the session start. Ordinary heartbeats and a valid assignee
--      are unaffected.
--   3. R4-02 — a legitimate progress write made directly on the direct
--      assignment row (the previously deployed activity route's shape after
--      P4: course_start -> sequence, path_complete -> completion) reaches the
--      authoritative record: the Codex reproduction (sequence 1 -> 2 then end
--      with a NULL sequence argument) now leaves 2 in both records; completion
--      keeps its first value; last activity is monotonic; a direct row without a
--      progress row gets one copied; the reconciliation survives an
--      assignment-source change; the mirror write is not mirrored back (no
--      double count, flag cleared); group rows are ignored.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(96);

CREATE OR REPLACE FUNCTION pg_temp.set_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.open_session(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.learning_path_progress_sessions WHERE user_id = tests.get_supabase_uid(k) AND session_end IS NULL
$$;
CREATE OR REPLACE FUNCTION pg_temp.heartbeat(k text) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT last_heartbeat FROM public.learning_path_progress_sessions WHERE id = pg_temp.open_session(k)
$$;
CREATE OR REPLACE FUNCTION pg_temp.progress(k text) RETURNS public.learning_path_user_progress
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT up.* FROM public.learning_path_user_progress up
   WHERE up.user_id = tests.get_supabase_uid(k) AND up.path_id = '75000000-0000-4000-8000-00000000000a'
$$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('r4_admin');
SELECT tests.create_supabase_user('r4_forge');    -- direct assignee: forges the heartbeat, then the assignment is removed
SELECT tests.create_supabase_user('r4_group');    -- group member: forges the heartbeat, then the membership ends
SELECT tests.create_supabase_user('r4_legacy');   -- direct assignee with a PRE-GUARD future heartbeat (triggers bypassed)
SELECT tests.create_supabase_user('r4_valid');    -- direct assignee, ordinary heartbeats
SELECT tests.create_supabase_user('r4_seq');      -- direct assignee: the old activity route's writes after P4 (Codex reproduction)
SELECT tests.create_supabase_user('r4_bare');     -- direct row written with triggers bypassed (no progress row)
SELECT tests.create_supabase_user('r4_switch');   -- group-only -> direct -> group-only, with a legacy write in between

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['r4_admin','r4_forge','r4_group','r4_legacy','r4_valid','r4_seq','r4_bare','r4_switch']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9751, 'R4 school (pgTAP 075)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('75000000-0000-4000-8000-00000000c001', 9751, 'R4 community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('75000000-0000-4000-8000-00000000bb01', '75000000-0000-4000-8000-00000000c001', 'R4 workspace');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('r4_admin'),  'admin',   NULL, NULL, true),
  (pg_temp.uid('r4_forge'),  'docente', 9751, NULL, true),
  (pg_temp.uid('r4_group'),  'docente', 9751, '75000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r4_legacy'), 'docente', 9751, NULL, true),
  (pg_temp.uid('r4_valid'),  'docente', 9751, NULL, true),
  (pg_temp.uid('r4_seq'),    'docente', 9751, NULL, true),
  (pg_temp.uid('r4_bare'),   'docente', 9751, NULL, true),
  (pg_temp.uid('r4_switch'), 'docente', 9751, '75000000-0000-4000-8000-00000000c001', true);

INSERT INTO public.instructors (id, full_name) VALUES ('75000000-0000-4000-8000-00000000f001', 'R4 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('75000000-0000-4000-8000-000000000c01', 'R4 course 1', 'R4 course 1', '75000000-0000-4000-8000-00000000f001'),
  ('75000000-0000-4000-8000-000000000c02', 'R4 course 2', 'R4 course 2', '75000000-0000-4000-8000-00000000f001');
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('75000000-0000-4000-8000-00000000000a', 'R4 path A', 'direct + group', pg_temp.uid('r4_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('75000000-0000-4000-8000-00000000000a', '75000000-0000-4000-8000-000000000c01', 1),
  ('75000000-0000-4000-8000-00000000000a', '75000000-0000-4000-8000-000000000c02', 2);
INSERT INTO public.learning_path_assignments (id, path_id, user_id, group_id, assigned_by) VALUES
  ('75000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-00000000000a', pg_temp.uid('r4_forge'),  NULL, pg_temp.uid('r4_admin')),
  ('75000000-0000-4000-8000-0000000000a3', '75000000-0000-4000-8000-00000000000a', pg_temp.uid('r4_legacy'), NULL, pg_temp.uid('r4_admin')),
  ('75000000-0000-4000-8000-0000000000a4', '75000000-0000-4000-8000-00000000000a', pg_temp.uid('r4_valid'),  NULL, pg_temp.uid('r4_admin')),
  ('75000000-0000-4000-8000-0000000000a5', '75000000-0000-4000-8000-00000000000a', pg_temp.uid('r4_seq'),    NULL, pg_temp.uid('r4_admin')),
  ('75000000-0000-4000-8000-0000000000a9', '75000000-0000-4000-8000-00000000000a', NULL, '75000000-0000-4000-8000-00000000bb01', pg_temp.uid('r4_admin'));

-- ============================================================================
-- 1. Catalog
-- ============================================================================
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.learning_path_progress_sessions'::regclass
             AND tgname = 'learning_path_progress_sessions_heartbeat_guard' AND NOT tgisinternal AND tgenabled <> 'D'),
  'R4-01: the heartbeat guard trigger is installed and enabled on the sessions table');                -- 1
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.learning_path_assignments'::regclass
             AND tgname = 'learning_path_assignments_sync_progress' AND NOT tgisinternal AND tgenabled <> 'D'),
  'R4-02: the legacy-progress sync trigger is installed and enabled on the assignments table');        -- 1
SELECT ok(NOT has_function_privilege(r.role, 'public.lp_last_authorized_heartbeat(timestamptz, timestamptz, timestamptz)', 'EXECUTE'),
  format('%s cannot execute internal lp_last_authorized_heartbeat', r.role))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role) ORDER BY r.role;                     -- 3
SELECT ok(NOT has_function_privilege(r.role, 'public.learning_path_sessions_heartbeat_guard()', 'EXECUTE'),
  format('%s cannot execute the heartbeat guard trigger function', r.role))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role) ORDER BY r.role;                     -- 3
SELECT ok(NOT has_function_privilege(r.role, 'public.learning_path_assignments_sync_progress()', 'EXECUTE'),
  format('%s cannot execute the sync trigger function', r.role))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role) ORDER BY r.role;                     -- 3
SELECT ok(has_column_privilege('authenticated', 'public.learning_path_progress_sessions', 'last_heartbeat', 'UPDATE'),
  'R3-05 compatibility: last_heartbeat stays in the authenticated UPDATE grant (the guard, not the grant, fixes the value)'); -- 1
-- the helper's contract
SELECT is(public.lp_last_authorized_heartbeat(now() - interval '10 minutes', now() - interval '20 minutes', now()), now() - interval '10 minutes',
  'helper: an ordinary (past) heartbeat is the mark');                                                  -- 1
SELECT is(public.lp_last_authorized_heartbeat(now() - interval '30 minutes', now() - interval '20 minutes', now()), now() - interval '20 minutes',
  'helper: a heartbeat before the start is raised to the start');                                       -- 1
SELECT is(public.lp_last_authorized_heartbeat(now() + interval '1 day', now() - interval '20 minutes', now()), now() - interval '20 minutes',
  'helper: a FUTURE heartbeat establishes nothing — the mark is the session start');                    -- 1
SELECT is(public.lp_last_authorized_heartbeat('infinity'::timestamptz, now() - interval '20 minutes', now()), now() - interval '20 minutes',
  'helper: infinity establishes nothing either');                                                       -- 1
SELECT is(public.lp_last_authorized_heartbeat(NULL, now() - interval '20 minutes', now()), now() - interval '20 minutes',
  'helper: NULL falls back to the session start');                                                      -- 1

-- ============================================================================
-- 2. R4-01 — the heartbeat is server-derived on every write path
-- ============================================================================
-- (a) direct assignee forges the heartbeat through the direct UPDATE grant,
--     then the assignment is removed (Codex reproduction, deterministic form:
--     the real 62-second variant is scripts/ci/lp-session-settlement-proof.mjs §8)
SELECT tests.authenticate_as('r4_forge');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_forge'), '75000000-0000-4000-8000-00000000000a', '75000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'forge: start succeeds while assigned');                                                              -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '10 minutes' WHERE id = pg_temp.open_session('r4_forge');
SELECT tests.authenticate_as('r4_forge');
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = 'infinity' WHERE id = pg_temp.open_session('r4_forge')$$,
  'forge: the direct UPDATE of last_heartbeat = infinity is accepted by the grant/policy (Codex reproduction step 2)'); -- 1
SELECT is(pg_temp.heartbeat('r4_forge'), now(),
  'forge: ... but the stored value is the server clock, not infinity');                                 -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() + interval '30 days' WHERE id = pg_temp.open_session('r4_forge')$$,
  'forge: a finite future value is accepted');                                                          -- 1
SELECT is(pg_temp.heartbeat('r4_forge'), now(), 'forge: ... and stored as now()');                      -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() - interval '9 minutes' WHERE id = pg_temp.open_session('r4_forge')$$,
  'forge: a client backdate is accepted');                                                              -- 1
SELECT is(pg_temp.heartbeat('r4_forge'), now(), 'forge: ... and stored as now() — the client never chooses the value'); -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = NULL WHERE id = pg_temp.open_session('r4_forge')$$,
  'forge: a NULL heartbeat is accepted');                                                               -- 1
SELECT is(pg_temp.heartbeat('r4_forge'), now(), 'forge: ... and stored as now() (NOT NULL preserved)'); -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions
       SET activity_type = 'course_start', course_id = '75000000-0000-4000-8000-000000000c02', last_heartbeat = 'infinity', updated_at = 'infinity'
     WHERE id = pg_temp.open_session('r4_forge')$$,
  'forge: the old activity route''s exact UPDATE shape with forged timing is accepted');                -- 1
SELECT is((SELECT (last_heartbeat = now(), updated_at = now(), activity_type, course_id) FROM public.learning_path_progress_sessions WHERE id = pg_temp.open_session('r4_forge')),
  (true, true, 'course_start'::varchar, '75000000-0000-4000-8000-000000000c02'::uuid),
  'forge: ... activity and course are applied, both timestamps are the server clock');                  -- 1
RESET ROLE;
DELETE FROM public.learning_path_assignments WHERE id = '75000000-0000-4000-8000-0000000000a1';
SELECT tests.authenticate_as('r4_forge');
SELECT ok(NOT public.auth_is_learning_path_assignee('75000000-0000-4000-8000-00000000000a'),
  'forge: after the assignment is removed, no authority (Codex reproduction step 3)');                  -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() WHERE id = pg_temp.open_session('r4_forge')$$,
  '42501', NULL, 'forge: after revocation even the direct heartbeat UPDATE is refused by the policy (the mark cannot move)'); -- 1
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_forge')),
  'forge: end still returns TRUE after revocation (Codex reproduction step 5)');                        -- 1
RESET ROLE;
SELECT is((SELECT (session_end = last_heartbeat, session_end <= now(), time_spent_minutes, credited_minutes)
             FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r4_forge')),
  (true, true, 10, 10),
  'forge: the session closed at the stored SERVER heartbeat — 10 minutes from the backdated start, not at infinity'); -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r4_forge')), 10,
  'forge: own progress credited exactly the authorized 10 minutes');                                    -- 1

-- (b) group member forges the heartbeat, then the membership ends
SELECT tests.authenticate_as('r4_group');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_group'), '75000000-0000-4000-8000-00000000000a')$$,
  'group: start succeeds while the membership is active');                                              -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '7 minutes' WHERE id = pg_temp.open_session('r4_group');
SELECT tests.authenticate_as('r4_group');
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = 'infinity' WHERE id = pg_temp.open_session('r4_group')$$,
  'group: forged infinity accepted');                                                                   -- 1
SELECT is(pg_temp.heartbeat('r4_group'), now(), 'group: ... stored as now()');                          -- 1
RESET ROLE;
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('r4_group');
SELECT tests.authenticate_as('r4_group');
SELECT throws_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() WHERE id = pg_temp.open_session('r4_group')$$,
  '42501', NULL, 'group: after the membership ends the direct heartbeat UPDATE is refused');            -- 1
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_group')), 'group: end after revocation returns TRUE'); -- 1
RESET ROLE;
SELECT is((SELECT (session_end = last_heartbeat, time_spent_minutes) FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r4_group')),
  (true, 7), 'group: closed at the stored server heartbeat (7 minutes), not at the forged value');       -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r4_group')), 7,
  'group: own progress credited the 7 authorized minutes');                                             -- 1

-- (c) a PRE-GUARD future heartbeat (stored before the trigger existed by a
--     client that controlled it) is no evidence of authorization
SELECT tests.authenticate_as('r4_legacy');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_legacy'), '75000000-0000-4000-8000-00000000000a')$$,
  'legacy: start');                                                                                     -- 1
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.learning_path_progress_sessions
   SET session_start = now() - interval '20 minutes', last_heartbeat = now() + interval '1 day'
 WHERE id = pg_temp.open_session('r4_legacy');
SET LOCAL session_replication_role = origin;
SELECT ok(pg_temp.heartbeat('r4_legacy') > now(), 'legacy: precondition — a stored future heartbeat (triggers bypassed)'); -- 1
DELETE FROM public.learning_path_assignments WHERE id = '75000000-0000-4000-8000-0000000000a3';
SELECT tests.authenticate_as('r4_legacy');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_legacy')), 'legacy: end after revocation returns TRUE'); -- 1
RESET ROLE;
SELECT is((SELECT (session_end = session_start, time_spent_minutes, credited_minutes) FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r4_legacy')),
  (true, 0, 0), 'legacy: the implausible heartbeat counts for nothing — closed at the session start, 0 minutes'); -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r4_legacy')), 0,
  'legacy: nothing credited from a client-controlled timestamp');                                       -- 1
-- and the maintenance close treats such a row the same way (and a legitimately
-- stale session normally)
SET LOCAL session_replication_role = replica;
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat) VALUES
  ('75000000-0000-4000-8000-0000000000e7', pg_temp.uid('r4_legacy'), '75000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '50 minutes', 'infinity'),
  ('75000000-0000-4000-8000-0000000000e8', pg_temp.uid('r4_admin'),  '75000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '50 minutes', now() - interval '20 minutes');
SET LOCAL session_replication_role = origin;
SELECT pg_temp.set_service();
SELECT is((SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes')), '{"closed": 2, "settled": 2}'::jsonb,
  'maintenance: the pre-guard infinity session IS stale (its authorized mark is its start) and is closed with the ordinary stale one'); -- 1
RESET ROLE;
SELECT is((SELECT (session_end = session_start, time_spent_minutes, credited_minutes) FROM public.learning_path_progress_sessions WHERE id = '75000000-0000-4000-8000-0000000000e7'),
  (true, 0, 0), 'maintenance: the infinity session closed at its start with 0 minutes');                 -- 1
SELECT is((SELECT (session_end = last_heartbeat, time_spent_minutes, credited_minutes) FROM public.learning_path_progress_sessions WHERE id = '75000000-0000-4000-8000-0000000000e8'),
  (true, 30, 30), 'maintenance: the ordinary stale session closed at its heartbeat with 30 minutes (unchanged behaviour)'); -- 1

-- (d) ordinary heartbeats and backend writers
SELECT tests.authenticate_as('r4_valid');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_valid'), '75000000-0000-4000-8000-00000000000a', '75000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'valid: start');                                                                                      -- 1
SELECT ok(public.update_session_heartbeat(pg_temp.open_session('r4_valid')), 'valid: RPC heartbeat works'); -- 1
SELECT is(pg_temp.heartbeat('r4_valid'), now(), 'valid: RPC heartbeat stores now()');                   -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r4_valid'), 'course_progress', NULL)) ->> 'ok')::boolean, true,
  'valid: RPC activity works');                                                                         -- 1
SELECT is(pg_temp.heartbeat('r4_valid'), now(), 'valid: RPC activity stores now()');                    -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = now(), updated_at = now() WHERE id = pg_temp.open_session('r4_valid')$$,
  'valid: the old route''s ordinary direct heartbeat write works');                                     -- 1
SELECT is(pg_temp.heartbeat('r4_valid'), now(), 'valid: ... and stores now()');                         -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() - interval '3 minutes' WHERE id = pg_temp.open_session('r4_valid');
SELECT is(pg_temp.heartbeat('r4_valid'), now() - interval '3 minutes',
  'backend (postgres): may backdate the heartbeat (a backdate only reduces credit; test fixtures rely on it)'); -- 1
UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() + interval '1 hour' WHERE id = pg_temp.open_session('r4_valid');
SELECT is(pg_temp.heartbeat('r4_valid'), now(), 'backend (postgres): a future value is clamped to now()'); -- 1
SELECT pg_temp.set_service();
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET last_heartbeat = 'infinity' WHERE id = pg_temp.open_session('r4_valid')$$,
  'service_role: may write the column');                                                                -- 1
RESET ROLE;
SELECT is(pg_temp.heartbeat('r4_valid'), now(), 'service_role: ... but infinity is clamped to now()');   -- 1
-- INSERT path: a closed historical row inserted by a backend with a future heartbeat
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat, settled_at) VALUES
  ('75000000-0000-4000-8000-0000000000e5', pg_temp.uid('r4_admin'), '75000000-0000-4000-8000-00000000000a', 'path_view',
   now() - interval '100 minutes', now() - interval '90 minutes', 10, now() + interval '1 year', now() - interval '90 minutes');
SELECT is((SELECT last_heartbeat FROM public.learning_path_progress_sessions WHERE id = '75000000-0000-4000-8000-0000000000e5'), now(),
  'INSERT: a future heartbeat is clamped to now() on insert too');                                      -- 1
-- a valid assignee's end is unaffected: closed at now(), full minutes
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '12 minutes' WHERE id = pg_temp.open_session('r4_valid');
SELECT tests.authenticate_as('r4_valid');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_valid')), 'valid: end');            -- 1
RESET ROLE;
SELECT is((SELECT (session_end = now(), time_spent_minutes) FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r4_valid')),
  (true, 12), 'valid: a current assignee closes at now() with the full 12 minutes (the guard changes nothing for them)'); -- 1

-- ============================================================================
-- 3. R4-02 — legacy progress writes reach the authoritative record
-- ============================================================================
-- (a) the Codex reproduction: assignment sequence 1 / record sequence 1; the
--     old activity route's course_start UPDATE sets 2; end with a NULL
--     sequence argument; both must read 2.
SELECT is((SELECT (a.current_course_sequence, (pg_temp.progress('r4_seq')).current_course_sequence)
             FROM public.learning_path_assignments a WHERE a.id = '75000000-0000-4000-8000-0000000000a5'),
  (1, 1), 'seq: precondition — assignment sequence 1, authoritative sequence 1 (Codex reproduction step 1)'); -- 1
SELECT tests.authenticate_as('r4_seq');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_seq'), '75000000-0000-4000-8000-00000000000a', '75000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'seq: start');                                                                                        -- 1
-- the old route: session UPDATE, then the assignment sequence UPDATE (two PostgREST requests)
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions
       SET activity_type = 'course_start', course_id = '75000000-0000-4000-8000-000000000c02', last_heartbeat = now(), updated_at = now()
     WHERE id = pg_temp.open_session('r4_seq')$$,
  'seq: old activity route — session UPDATE');                                                          -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET current_course_sequence = 2, last_activity_at = now()
     WHERE user_id = pg_temp.uid('r4_seq') AND path_id = '75000000-0000-4000-8000-00000000000a'$$,
  'seq: old activity route — course_start assignment UPDATE (sequence 2; Codex reproduction step 2)');  -- 1
RESET ROLE;
SELECT is((pg_temp.progress('r4_seq')).current_course_sequence, 2,
  'seq: the authoritative record now reads 2 (was 1: the reproduced defect)');                           -- 1
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '8 minutes' WHERE id = pg_temp.open_session('r4_seq');
SELECT tests.authenticate_as('r4_seq');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_seq')), 'seq: end through the real RPC (NULL sequence argument; Codex reproduction step 3)'); -- 1
RESET ROLE;
SELECT is((SELECT (a.current_course_sequence, (pg_temp.progress('r4_seq')).current_course_sequence)
             FROM public.learning_path_assignments a WHERE a.id = '75000000-0000-4000-8000-0000000000a5'),
  (2, 2), 'seq: after settlement both records read 2 (Codex observed assignment 2 / authoritative 1)');   -- 1
SELECT is((SELECT (a.total_time_spent_minutes, (pg_temp.progress('r4_seq')).total_time_spent_minutes)
             FROM public.learning_path_assignments a WHERE a.id = '75000000-0000-4000-8000-0000000000a5'),
  (8, 8), 'seq: the mirror write was not reconciled back (8 in both, not doubled)');                      -- 1
SELECT is(coalesce(current_setting('lp.mirror_write', true), ''), '',
  'seq: the mirror-write flag is cleared after the settlement');                                        -- 1
-- what the new reader selects (enhanced-progress.ts prefers the record)
SELECT is((SELECT coalesce(up.current_course_sequence, a.current_course_sequence)
             FROM public.learning_path_assignments a
             LEFT JOIN public.learning_path_user_progress up ON up.user_id = a.user_id AND up.path_id = a.path_id
            WHERE a.id = '75000000-0000-4000-8000-0000000000a5'), 2,
  'seq: the new reader''s selection (record first) reports course 2');                                   -- 1
-- path_complete: completion reaches the record; the old route re-stamps it on
-- every call, the record keeps its first value; last activity is monotonic
SELECT tests.authenticate_as('r4_seq');
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET completed_at = now() - interval '1 minute', last_activity_at = now() - interval '1 minute'
     WHERE user_id = pg_temp.uid('r4_seq') AND path_id = '75000000-0000-4000-8000-00000000000a'$$,
  'seq: old activity route — path_complete assignment UPDATE');                                         -- 1
RESET ROLE;
SELECT is((pg_temp.progress('r4_seq')).completed_at, now() - interval '1 minute',
  'seq: completion reached the authoritative record');                                                  -- 1
SELECT is((pg_temp.progress('r4_seq')).last_activity_at, now(),
  'seq: last activity did not move backwards (the settlement stamped now())');                          -- 1
SELECT tests.authenticate_as('r4_seq');
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET completed_at = now() + interval '1 day', last_activity_at = now() + interval '1 day'
     WHERE user_id = pg_temp.uid('r4_seq') AND path_id = '75000000-0000-4000-8000-00000000000a'$$,
  'seq: a re-stamp of completed_at (the old route does this on every path_complete)');                  -- 1
RESET ROLE;
SELECT is((pg_temp.progress('r4_seq')).completed_at, now() - interval '1 minute',
  'seq: the record keeps the FIRST completion value (design choice 4)');                                -- 1
SELECT is((pg_temp.progress('r4_seq')).last_activity_at, now() + interval '1 day',
  'seq: last activity follows a later value');                                                          -- 1
SELECT tests.authenticate_as('r4_seq');
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET current_course_sequence = 1, last_activity_at = now()
     WHERE user_id = pg_temp.uid('r4_seq') AND path_id = '75000000-0000-4000-8000-00000000000a'$$,
  'seq: the learner re-starts course 1 (sequence goes back to 1 — a legitimate change)');               -- 1
RESET ROLE;
SELECT is((pg_temp.progress('r4_seq')).current_course_sequence, 1,
  'seq: the record follows the legitimate change (copied, not max-ed)');                                -- 1
SELECT is((pg_temp.progress('r4_seq')).last_activity_at, now() + interval '1 day',
  'seq: an older last_activity_at does not move the record backwards');                                 -- 1
-- a non-progress column UPDATE on the same row does not touch the record
UPDATE public.learning_path_assignments SET progress_percentage = 50 WHERE id = '75000000-0000-4000-8000-0000000000a5';
SELECT is((SELECT (current_course_sequence, completed_at, total_time_spent_minutes) FROM pg_temp.progress('r4_seq')),
  (1, now() - interval '1 minute', 8), 'seq: an unrelated column write leaves the record alone');        -- 1

-- (b) a direct row with NO progress row (written with triggers bypassed):
--     the first legacy write creates the record, copied, then applies
SET LOCAL session_replication_role = replica;
INSERT INTO public.learning_path_assignments (id, path_id, user_id, assigned_by, total_time_spent_minutes, started_at, current_course_sequence)
VALUES ('75000000-0000-4000-8000-0000000000a6', '75000000-0000-4000-8000-00000000000a', pg_temp.uid('r4_bare'), pg_temp.uid('r4_admin'), 45, now() - interval '9 days', 1);
SET LOCAL session_replication_role = origin;
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r4_bare')), 0,
  'bare: precondition — no progress row');                                                              -- 1
SELECT tests.authenticate_as('r4_bare');
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET current_course_sequence = 2, last_activity_at = now()
     WHERE user_id = pg_temp.uid('r4_bare') AND path_id = '75000000-0000-4000-8000-00000000000a'$$,
  'bare: old activity route — course_start on a row without a progress row');                           -- 1
RESET ROLE;
SELECT is((SELECT (total_time_spent_minutes, current_course_sequence, started_at < now() - interval '8 days', last_activity_at) FROM pg_temp.progress('r4_bare')),
  (45, 2, true, now()), 'bare: the record was created from the row''s history (45 minutes, started 9 days ago) and carries the new sequence'); -- 1

-- (c) assignment-source change with a legacy write in between:
--     group-only -> direct (seeded) -> legacy write on the direct row -> direct row removed
SELECT tests.authenticate_as('r4_switch');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_switch'), '75000000-0000-4000-8000-00000000000a', '75000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'switch: start as a group-only member');                                                              -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r4_switch'), 'course_start', '75000000-0000-4000-8000-000000000c02')) ->> 'ok')::boolean, true,
  'switch: sequence 2 through the new RPC');                                                            -- 1
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_switch')), 'switch: end');          -- 1
RESET ROLE;
SELECT tests.authenticate_as('r4_admin');
SELECT lives_ok(
  $$SELECT public.batch_assign_learning_path('75000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('r4_switch')], NULL, pg_temp.uid('r4_admin'))$$,
  'admin: adds a direct assignment');                                                                   -- 1
RESET ROLE;
SELECT is((SELECT current_course_sequence FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r4_switch')), 2,
  'switch: the new direct row is seeded with sequence 2 (R3-04)');                                      -- 1
SELECT tests.authenticate_as('r4_switch');
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET current_course_sequence = 1, last_activity_at = now()
     WHERE user_id = pg_temp.uid('r4_switch') AND path_id = '75000000-0000-4000-8000-00000000000a'$$,
  'switch: old activity route — course_start (sequence 1) on the new direct row');                      -- 1
RESET ROLE;
SELECT is((pg_temp.progress('r4_switch')).current_course_sequence, 1,
  'switch: the record follows the legacy write on the direct row');                                     -- 1
DELETE FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r4_switch');
SELECT is((pg_temp.progress('r4_switch')).current_course_sequence, 1,
  'switch: removing the direct row keeps the reconciled record');                                       -- 1
SELECT tests.authenticate_as('r4_switch');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r4_switch'), '75000000-0000-4000-8000-00000000000a')$$,
  'switch: still starts as a group-only member');                                                       -- 1
RESET ROLE;
SELECT is((pg_temp.progress('r4_switch')).current_course_sequence, 1,
  'switch: a new start does not disturb the sequence');                                                 -- 1

-- (d) group assignment rows (user_id NULL) are never reconciled
CREATE TEMP TABLE r4_counts AS
  SELECT count(*)::int AS n, coalesce(sum(current_course_sequence), 0)::int AS seq_sum FROM public.learning_path_user_progress;
UPDATE public.learning_path_assignments SET last_activity_at = now(), current_course_sequence = 3 WHERE id = '75000000-0000-4000-8000-0000000000a9';
SELECT is((SELECT (count(*)::int, coalesce(sum(current_course_sequence), 0)::int) FROM public.learning_path_user_progress),
  (SELECT (n, seq_sum) FROM r4_counts),
  'group row: a progress-column write on a group row creates and changes no record (trigger WHEN excludes it)'); -- 1

SELECT * FROM finish();

ROLLBACK;
