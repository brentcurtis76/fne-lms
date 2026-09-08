-- =============================================================================
-- 073-r2-remediation.sql — Codex re-review R2 (2026-09-07): migration
-- 20260907120300_r2_remediation.sql, reproduced failure by failure.
--
--   1. catalog: learning_path_user_progress (RLS, guard, grants), session
--      INSERT revoked, the single-open trigger, and — per signature — the
--      grants and pinned search_path of every R2-01 correction
--   2. R2-02 reservation: exhaustion at the limit, remaining sequence, release
--      frees a slot, refused for anon / authenticated / bad parameters
--   3. R2-03: direct creation refused (grant), a second OPEN session refused
--      for ANY creator (trigger), overlapping closed sessions credit the UNION
--      of their intervals (sum would multiply), the high-water mark clips a
--      session overlapping an already-settled one, sequential starts leave one
--      open session
--   4. R2-04: a group-only member's start/end lands in their own progress row
--      (zero own assignment rows, group row untouched), retry credits once,
--      activity advances sequence / completion, a later member works, a member
--      who loses membership keeps the row but regains no authority, progress
--      rows are readable only by their owner (and admin) and writable by none
--   5. R2-01 live probes: anon and authenticated refusals, membership binding,
--      actor binding, the feedback trigger path preserved, backend access kept
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(283);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.set_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;
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

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('r2_admin');
SELECT tests.create_supabase_user('r2_direct');
SELECT tests.create_supabase_user('r2_direct2');   -- direct assignee with no prior session (mirror probe)
SELECT tests.create_supabase_user('r2_member');    -- group-only assignee (active now)
SELECT tests.create_supabase_user('r2_later');     -- joins the group mid-test
SELECT tests.create_supabase_user('r2_leaver');    -- group member who loses membership mid-test
SELECT tests.create_supabase_user('r2_outsider');  -- no assignment, no membership

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['r2_admin','r2_direct','r2_direct2','r2_member','r2_later','r2_leaver','r2_outsider']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9731, 'R2 school (pgTAP 073)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('73000000-0000-4000-8000-00000000c001', 9731, 'R2 community'),
  ('73000000-0000-4000-8000-00000000c002', 9731, 'R2 other community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('73000000-0000-4000-8000-00000000bb01', '73000000-0000-4000-8000-00000000c001', 'R2 workspace'),
  ('73000000-0000-4000-8000-00000000bb02', '73000000-0000-4000-8000-00000000c002', 'R2 other workspace');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('r2_admin'),    'admin',   NULL, NULL, true),
  (pg_temp.uid('r2_direct'),   'docente', 9731, NULL, true),
  (pg_temp.uid('r2_direct2'),  'docente', 9731, NULL, true),
  (pg_temp.uid('r2_member'),   'docente', 9731, '73000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r2_leaver'),   'docente', 9731, '73000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r2_later'),    'docente', 9731, NULL, true),
  (pg_temp.uid('r2_outsider'), 'docente', 9731, NULL, true);

INSERT INTO public.instructors (id, full_name) VALUES ('73000000-0000-4000-8000-00000000f001', 'R2 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('73000000-0000-4000-8000-000000000c01', 'R2 course 1', 'R2 course 1', '73000000-0000-4000-8000-00000000f001'),
  ('73000000-0000-4000-8000-000000000c02', 'R2 course 2', 'R2 course 2', '73000000-0000-4000-8000-00000000f001');
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('73000000-0000-4000-8000-00000000000a', 'R2 path A', 'direct + group', pg_temp.uid('r2_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('73000000-0000-4000-8000-00000000000a', '73000000-0000-4000-8000-000000000c01', 1),
  ('73000000-0000-4000-8000-00000000000a', '73000000-0000-4000-8000-000000000c02', 2);
INSERT INTO public.learning_path_assignments (id, path_id, user_id, group_id, assigned_by) VALUES
  ('73000000-0000-4000-8000-0000000000a1', '73000000-0000-4000-8000-00000000000a', pg_temp.uid('r2_direct'), NULL, pg_temp.uid('r2_admin')),
  ('73000000-0000-4000-8000-0000000000a4', '73000000-0000-4000-8000-00000000000a', pg_temp.uid('r2_direct2'), NULL, pg_temp.uid('r2_admin')),
  ('73000000-0000-4000-8000-0000000000a2', '73000000-0000-4000-8000-00000000000a', NULL, '73000000-0000-4000-8000-00000000bb01', pg_temp.uid('r2_admin'));

-- Workspace content for the R2-01 membership probes (workspace bb01 = community c001).
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by) VALUES
  ('73000000-0000-4000-8000-00000000d001', '73000000-0000-4000-8000-00000000bb01', 'R2 meeting', now() + interval '1 day', pg_temp.uid('r2_admin'));
INSERT INTO public.document_folders (id, workspace_id, folder_name, created_by) VALUES
  ('73000000-0000-4000-8000-00000000d101', '73000000-0000-4000-8000-00000000bb01', 'R2 folder', pg_temp.uid('r2_admin'));
INSERT INTO public.user_notifications (id, user_id, title) VALUES
  ('73000000-0000-4000-8000-00000000d201', pg_temp.uid('r2_member'), 'R2 notification for member'),
  ('73000000-0000-4000-8000-00000000d202', pg_temp.uid('r2_direct'), 'R2 notification for direct');
INSERT INTO public.platform_feedback (id, description, type, status, created_by) VALUES
  ('73000000-0000-4000-8000-00000000d301', 'R2 synthetic feedback', 'bug', 'new', pg_temp.uid('r2_direct'));

-- ============================================================================
-- 1. Catalog
-- ============================================================================
SELECT tests.rls_enabled('public', 'learning_path_user_progress');                                    -- 1
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'learning_path_user_progress'
             AND policyname = 'forced_password_change_guard' AND permissive = 'RESTRICTIVE'),
  'learning_path_user_progress carries the restrictive forced_password_change_guard');                -- 1
SELECT ok(NOT has_table_privilege('anon', 'public.learning_path_user_progress', 'SELECT'),
  'anon holds no SELECT on learning_path_user_progress');                                             -- 1
SELECT ok(has_table_privilege('authenticated', 'public.learning_path_user_progress', 'SELECT'),
  'authenticated may SELECT learning_path_user_progress (own rows by policy)');                       -- 1
SELECT ok(NOT has_table_privilege('authenticated', 'public.learning_path_user_progress', o.op),
  format('authenticated holds no %s on learning_path_user_progress', o.op))
FROM (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) o(op);                                  -- 4
SELECT ok(NOT has_table_privilege('authenticated', 'public.learning_path_progress_sessions', 'INSERT'),
  'R2-03: authenticated holds no INSERT on learning_path_progress_sessions');                         -- 1
SELECT is((SELECT count(*)::int FROM information_schema.column_privileges
            WHERE table_schema = 'public' AND table_name = 'learning_path_progress_sessions'
              AND grantee = 'authenticated' AND privilege_type = 'INSERT'), 0,
  'R2-03: and no column-level INSERT either');                                                        -- 1
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.learning_path_progress_sessions'::regclass
             AND tgname = 'learning_path_sessions_single_open' AND NOT tgisinternal AND tgenabled <> 'D'),
  'R2-03: the single-open-session trigger is installed and enabled');                                 -- 1
SELECT has_column('public', 'learning_path_progress_sessions', 'credited_minutes', 'R2-03: credited_minutes column exists'); -- 1

-- R2-01: backend-only boundary (service_role only) — 20 signatures × 4 = 80
CREATE TEMP TABLE r2_backend_only (sig) AS VALUES
  ('public.get_all_auth_users()'),
  ('public.refresh_user_roles_cache()'),
  ('public.cleanup_expired_test_runs()'),
  ('public.create_assignment_template_from_block(uuid, uuid, jsonb, uuid)'),
  ('public.create_document_version(uuid, text, bigint, character varying, uuid)'),
  ('public.create_notification(uuid, character varying, character varying, text, character varying, uuid, jsonb)'),
  ('public.create_sample_notifications_for_user(uuid)'),
  ('public.create_user_notification(uuid, character varying, character varying, text, character varying)'),
  ('public.grade_quiz_open_responses(uuid, uuid, jsonb)'),
  ('public.get_or_create_community_workspace(uuid)'),
  ('public.award_course_completion_badge(uuid, uuid, text)'),
  ('public.start_dev_impersonation(uuid, user_role_type, uuid, integer, uuid, uuid, inet, text)'),
  ('public.end_dev_impersonation(uuid, inet, text)'),
  ('public.get_active_dev_impersonation(uuid)'),
  ('public.get_reportable_users(uuid)'),
  ('public.get_reportable_users_enhanced(uuid)'),
  ('public.get_activity_stats(uuid)'),
  ('public.get_thread_statistics(uuid)'),
  ('public.get_workspace_messaging_stats(uuid)'),
  ('public.calculate_quiz_score(uuid)'),
  ('public.reserve_propuesta_access_attempt(text, text, integer, interval)'),
  ('public.release_propuesta_access_attempt(bigint)');
SELECT ok(NOT has_function_privilege('anon', f.sig, 'EXECUTE'), format('anon cannot execute %s', f.sig))
FROM r2_backend_only f ORDER BY f.sig;                                                                -- 22
SELECT ok(NOT has_function_privilege('authenticated', f.sig, 'EXECUTE'), format('authenticated cannot execute %s', f.sig))
FROM r2_backend_only f ORDER BY f.sig;                                                                -- 22
SELECT ok(NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = f.sig::regprocedure)) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  format('PUBLIC holds no EXECUTE on %s', f.sig))
FROM r2_backend_only f ORDER BY f.sig;                                                                -- 22
SELECT ok(has_function_privilege('service_role', f.sig, 'EXECUTE'), format('service_role keeps EXECUTE on %s', f.sig))
FROM r2_backend_only f ORDER BY f.sig;                                                                -- 22

-- R2-01: actor / membership bound, authenticated kept — 13 signatures × 3 = 39
CREATE TEMP TABLE r2_actor_bound (sig) AS VALUES
  ('public.create_activity(uuid, activity_type, entity_type, uuid, uuid, text, text, jsonb, integer, text[], uuid[])'),
  ('public.increment_document_counter(uuid, text, uuid)'),
  ('public.get_document_statistics(uuid)'),
  ('public.get_recent_document_activity(uuid, integer)'),
  ('public.get_meeting_stats(uuid)'),
  ('public.get_overdue_items(uuid, uuid)'),
  ('public.get_folder_breadcrumb(uuid)'),
  ('public.get_unread_notification_count(uuid)'),
  ('public.get_user_badges(uuid)'),
  ('public.mark_all_notifications_read(uuid)'),
  ('public.mark_notification_read(uuid, uuid)'),
  ('public.add_feedback_activity(uuid, text, uuid, boolean)'),
  ('public.update_overdue_status()');
SELECT ok(NOT has_function_privilege('anon', f.sig, 'EXECUTE'), format('anon cannot execute %s', f.sig))
FROM r2_actor_bound f ORDER BY f.sig;                                                                 -- 13
SELECT ok(NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = f.sig::regprocedure)) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  format('PUBLIC holds no EXECUTE on %s', f.sig))
FROM r2_actor_bound f ORDER BY f.sig;                                                                 -- 13
SELECT ok(has_function_privilege('authenticated', f.sig, 'EXECUTE'), format('authenticated keeps EXECUTE on %s (browser caller)', f.sig))
FROM r2_actor_bound f ORDER BY f.sig;                                                                 -- 13

SELECT is(
  (SELECT coalesce(array_agg(f.sig ORDER BY f.sig), '{}'::text[])
     FROM (SELECT sig FROM r2_backend_only UNION ALL SELECT sig FROM r2_actor_bound) f
    WHERE NOT EXISTS (SELECT 1 FROM unnest((SELECT proconfig FROM pg_proc WHERE oid = f.sig::regprocedure)) c
                       WHERE c = 'search_path=public, pg_temp')),
  '{}'::text[], 'every R2-01 signature runs with search_path pinned to public, pg_temp');             -- 1

-- Internal helpers: no application role may execute them directly
SELECT ok(NOT has_function_privilege(r.role, f.sig, 'EXECUTE'), format('%s cannot execute internal %s', r.role, f.sig))
FROM (VALUES ('public.lp_record_progress(uuid, uuid, integer, timestamp with time zone, integer, timestamp with time zone, boolean)'),
             ('public.assert_workspace_access(uuid)'), ('public.assert_actor_matches(uuid)'),
             ('public.lp_novel_minutes(bigint, bigint, bigint[], bigint[])'),
             ('public.settle_learning_path_sessions(uuid[])')) f(sig)
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) r(role) ORDER BY f.sig, r.role;      -- 15

-- ============================================================================
-- 2. R2-02 — attempt reservation
-- ============================================================================
SELECT pg_temp.set_service();
SELECT ok(public.auth_is_backend_caller(), 'service_role: is a backend caller');                      -- 1
SELECT is(
  (SELECT array_agg((public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug', 5, interval '1 hour') ->> 'allowed')::boolean ORDER BY g)
     FROM generate_series(1, 6) g),
  ARRAY[true, true, true, true, true, false],
  'six reservations of the same (ip, slug): the first five are allowed, the sixth is refused');       -- 1
SELECT is((SELECT count(*)::int FROM public.propuesta_rate_limits WHERE slug = 'r2-slug'), 5,
  'exactly five attempts were recorded (the refused one recorded nothing)');                          -- 1
SELECT is((SELECT (public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug')) ->> 'remaining')::int, 0,
  'a refused reservation reports remaining = 0');                                                     -- 1
SELECT is((SELECT (public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-other-slug')) ->> 'remaining')::int, 4,
  'a different slug has its own window (remaining 4 after the first attempt)');                       -- 1
SELECT is((SELECT (public.reserve_propuesta_access_attempt('198.51.100.8', 'r2-slug')) ->> 'remaining')::int, 4,
  'a different ip has its own window');                                                               -- 1
-- release gives a slot back (the correct-code path)
SELECT ok(public.release_propuesta_access_attempt((SELECT min(id) FROM public.propuesta_rate_limits WHERE slug = 'r2-slug' AND ip_address = '198.51.100.7')),
  'release of a recorded attempt returns TRUE');                                                      -- 1
SELECT is((SELECT (public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug')) ->> 'allowed')::boolean, true,
  'after a release the window admits one more attempt');                                              -- 1
SELECT is((SELECT (public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug')) ->> 'allowed')::boolean, false,
  'and is exhausted again afterwards');                                                               -- 1
SELECT ok(NOT public.release_propuesta_access_attempt(NULL), 'release of NULL is FALSE and harmless'); -- 1
SELECT ok(NOT public.release_propuesta_access_attempt(-1), 'release of an unknown id is FALSE');      -- 1
SELECT throws_ok($$SELECT public.reserve_propuesta_access_attempt('', 'r2-slug')$$, '22023', NULL,
  'an empty ip is rejected');                                                                         -- 1
SELECT throws_ok($$SELECT public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug', 0)$$, '22023', NULL,
  'a non-positive limit is rejected');                                                                -- 1
RESET ROLE;

SELECT tests.authenticate_as('r2_direct');
SELECT throws_ok($$SELECT public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug')$$, '42501', NULL,
  'authenticated: cannot reserve (not executable)');                                                  -- 1
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.reserve_propuesta_access_attempt('198.51.100.7', 'r2-slug')$$, '42501', NULL,
  'anon: cannot reserve (not executable)');                                                           -- 1
SELECT throws_ok($$SELECT public.release_propuesta_access_attempt(1)$$, '42501', NULL,
  'anon: cannot release (not executable)');                                                           -- 1
RESET ROLE;

-- ============================================================================
-- 3. R2-03 — one open session per (user, path); union credit
-- ============================================================================
SELECT tests.authenticate_as('r2_direct');
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
    VALUES (pg_temp.uid('r2_direct'), '73000000-0000-4000-8000-00000000000a', 'path_view')$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: cannot create a session by direct INSERT (Codex reproduction: ten open rows)');   -- 1
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_direct'), '73000000-0000-4000-8000-00000000000a')$$,
  'direct assignee: start #1 through the RPC succeeds');                                              -- 1
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_direct'), '73000000-0000-4000-8000-00000000000a')$$,
  'direct assignee: start #2 through the RPC succeeds (it closes #1)');                               -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_direct') AND session_end IS NULL), 1,
  'direct assignee: exactly one open session after two starts');                                      -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_direct') AND session_end IS NOT NULL AND settled_at IS NULL), 0,
  'direct assignee: the closed session was settled by the start that closed it');                     -- 1
RESET ROLE;

-- The invariant holds for a backend creator too (trigger, not grant).
SELECT pg_temp.set_service();
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
    VALUES (pg_temp.uid('r2_direct'), '73000000-0000-4000-8000-00000000000a', 'path_view')$$,
  '23505', 'An open learning-path session already exists for this user and path',
  'service_role: a second OPEN session for the same (user, path) is refused by the trigger');         -- 1
SELECT lives_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat)
    VALUES (pg_temp.uid('r2_direct'), '73000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '3 hours', now() - interval '2 hours', 60, now() - interval '2 hours')$$,
  'service_role: a CLOSED historical session may still be recorded (the invariant is about open ones)'); -- 1
RESET ROLE;

-- Union credit. As postgres: three closed, unsettled sessions for r2_outsider
-- (who has a direct assignment created here so the mirror is observable):
--   s1 [T-300, T-270] 30 min, s2 [T-290, T-260] 30 min (overlaps s1 by 20),
--   s3 [T-250, T-240] 10 min (disjoint). Sum = 70; union = 40 + 10 = 50.
INSERT INTO public.learning_path_assignments (id, path_id, user_id, assigned_by)
VALUES ('73000000-0000-4000-8000-0000000000a3', '73000000-0000-4000-8000-00000000000a', pg_temp.uid('r2_outsider'), pg_temp.uid('r2_admin'));
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat) VALUES
  ('73000000-0000-4000-8000-0000000000e1', pg_temp.uid('r2_outsider'), '73000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '300 minutes', now() - interval '270 minutes', 30, now() - interval '270 minutes'),
  ('73000000-0000-4000-8000-0000000000e2', pg_temp.uid('r2_outsider'), '73000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '290 minutes', now() - interval '260 minutes', 30, now() - interval '260 minutes'),
  ('73000000-0000-4000-8000-0000000000e3', pg_temp.uid('r2_outsider'), '73000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '250 minutes', now() - interval '240 minutes', 10, now() - interval '240 minutes');
-- lp_novel_minutes: disjoint intervals settled out of order are NOT clipped by a
-- scalar mark (the R2-03 regression the E2E maintenance test caught). Covered set
-- {[100,160]} (a later-ending interval); a disjoint EARLIER interval [0,1800]
-- (30 min) must credit its full 30, not 0.
SELECT is(public.lp_novel_minutes(0, 1800, ARRAY[100000]::bigint[], ARRAY[100060]::bigint[]), 30,
  'lp_novel_minutes: a disjoint earlier interval is credited in full despite a later covered interval'); -- 1
SELECT is(public.lp_novel_minutes(0, 1800, ARRAY[600]::bigint[], ARRAY[1200]::bigint[]), 20,
  'lp_novel_minutes: an overlapping covered interval [600,1200] leaves 20 of 30 minutes novel'); -- 1
SELECT is(public.settle_learning_path_sessions(ARRAY['73000000-0000-4000-8000-0000000000e1','73000000-0000-4000-8000-0000000000e2','73000000-0000-4000-8000-0000000000e3']::uuid[]), 3,
  'union credit: all three sessions are settled');                                                    -- 1
SELECT is((SELECT array_agg(credited_minutes ORDER BY session_start) FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_outsider')),
  ARRAY[30, 10, 10], 'union credit: credited_minutes are 30, 10 (the 20 overlapping minutes are not counted twice), 10'); -- 1
SELECT is((SELECT array_agg(time_spent_minutes ORDER BY session_start) FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_outsider')),
  ARRAY[30, 30, 10], 'union credit: each session keeps its own duration in time_spent_minutes');       -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '73000000-0000-4000-8000-0000000000a3'), 50,
  'union credit: the assignment received 50 minutes (the union), not 70 (the sum)');                  -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_outsider') AND path_id = '73000000-0000-4000-8000-00000000000a'), 50,
  'union credit: the own-progress row received the same 50 minutes');                                 -- 1
SELECT is(public.settle_learning_path_sessions(ARRAY['73000000-0000-4000-8000-0000000000e1','73000000-0000-4000-8000-0000000000e2']::uuid[]), 0,
  'union credit: settling again settles nothing');                                                    -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '73000000-0000-4000-8000-0000000000a3'), 50,
  'union credit: and credits nothing');                                                               -- 1
-- High-water mark: a later session overlapping the already-settled s3 is clipped.
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat) VALUES
  ('73000000-0000-4000-8000-0000000000e4', pg_temp.uid('r2_outsider'), '73000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '245 minutes', now() - interval '230 minutes', 15, now() - interval '230 minutes');
SELECT is(public.settle_learning_path_sessions(ARRAY['73000000-0000-4000-8000-0000000000e4']::uuid[]), 1, 'high-water mark: the overlapping later session is settled'); -- 1
SELECT is((SELECT credited_minutes FROM public.learning_path_progress_sessions WHERE id = '73000000-0000-4000-8000-0000000000e4'), 10,
  'high-water mark: only the 10 minutes beyond the already-settled interval are credited (15 elapsed)'); -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '73000000-0000-4000-8000-0000000000a3'), 60,
  'high-water mark: assignment total 60 = 50 + 10');                                                  -- 1
-- A session entirely inside an already-settled interval credits zero but is settled.
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat) VALUES
  ('73000000-0000-4000-8000-0000000000e5', pg_temp.uid('r2_outsider'), '73000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '280 minutes', now() - interval '275 minutes', 5, now() - interval '275 minutes');
SELECT is(public.settle_learning_path_sessions(ARRAY['73000000-0000-4000-8000-0000000000e5']::uuid[]), 1, 'covered interval: settled'); -- 1
SELECT is((SELECT credited_minutes FROM public.learning_path_progress_sessions WHERE id = '73000000-0000-4000-8000-0000000000e5'), 0,
  'covered interval: zero credit (never negative, never a second count)');                            -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '73000000-0000-4000-8000-0000000000a3'), 60,
  'covered interval: assignment total unchanged');                                                    -- 1

-- ============================================================================
-- 4. R2-04 — group-only progress
-- ============================================================================
SELECT tests.authenticate_as('r2_member');
SELECT ok(public.auth_is_learning_path_assignee('73000000-0000-4000-8000-00000000000a'),
  'group member: is a valid assignee (via the workspace -> community join)');                         -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r2_member')), 0,
  'group member: has NO own assignment row (Codex reproduction precondition)');                       -- 1
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_member'), '73000000-0000-4000-8000-00000000000a', '73000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'group member: start succeeds');                                                                    -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress), 1,
  'group member: sees exactly one progress row — their own');                                         -- 1
SELECT isnt((SELECT started_at FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_member')), NULL,
  'group member: their progress row records started_at');                                             -- 1
SELECT is((SELECT (public.record_learning_path_activity(
            (SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL),
            'course_start', '73000000-0000-4000-8000-000000000c02')) ->> 'ok')::boolean, true,
  'group member: activity course_start on course 2 is recorded');                                     -- 1
SELECT is((SELECT current_course_sequence FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_member')), 2,
  'group member: current_course_sequence advanced to 2 in their own progress row');                   -- 1
SELECT is((SELECT course_id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL),
  '73000000-0000-4000-8000-000000000c02'::uuid, 'group member: the open session now points at course 2'); -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(
      (SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL),
      'course_start', '73000000-0000-4000-8000-000000000c99')$$,
  '22023', 'Course is not part of this learning path',
  'group member: activity cannot point the session at a course outside the path');                    -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(
      (SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL),
      'nonsense', NULL)$$,
  '22023', 'Invalid activity type', 'group member: an unknown activity type is rejected');            -- 1
RESET ROLE;
-- Backdate the member's open session by 20 minutes (server-side, as postgres)
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '20 minutes'
 WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL;
SELECT tests.authenticate_as('r2_member');
SELECT ok(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL)),
  'group member: end returns TRUE (Codex reproduction: end TRUE, 20 minutes, settled)');              -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND settled_at IS NOT NULL), 1,
  'group member: the session is settled');                                                            -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_member')), 20,
  'group member: the 20 minutes are credited to THEIR OWN progress row (previously lost)');           -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r2_member')), 0,
  'group member: still no own assignment row — progress did not become an assignment');               -- 1
SELECT ok(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') ORDER BY session_start DESC LIMIT 1)),
  'group member: a repeated end returns TRUE');                                                       -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_member')), 20,
  'group member: and credits nothing more (retry-safe)');                                             -- 1
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_member'), '73000000-0000-4000-8000-00000000000a')$$,
  'group member: a new session starts');                                                              -- 1
SELECT is((SELECT (public.record_learning_path_activity(
            (SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_member') AND session_end IS NULL),
            'path_complete', NULL)) ->> 'ok')::boolean, true, 'group member: path_complete is recorded'); -- 1
SELECT isnt((SELECT completed_at FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_member')), NULL,
  'group member: completed_at is set in their own progress row');                                     -- 1
SELECT is((SELECT (public.record_learning_path_activity('73000000-0000-4000-8000-0000000000e1', 'path_view', NULL)) ->> 'reason'), 'not_found',
  'group member: activity on another user''s session answers not_found and writes nothing');          -- 1
-- writes to the progress table are refused for the application role
SELECT throws_ok(
  $$UPDATE public.learning_path_user_progress SET total_time_spent_minutes = 999999 WHERE user_id = pg_temp.uid('r2_member')$$,
  '42501', 'permission denied for table learning_path_user_progress',
  'group member: cannot write their own progress row directly');                                      -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_user_progress (user_id, path_id) VALUES (pg_temp.uid('r2_member'), '73000000-0000-4000-8000-00000000000a')$$,
  '42501', NULL, 'group member: cannot insert a progress row');                                       -- 1
SELECT throws_ok(
  $$DELETE FROM public.learning_path_user_progress$$,
  '42501', NULL, 'group member: cannot delete progress rows');                                        -- 1
RESET ROLE;

-- Group assignment row untouched; a direct assignee's mirror works. (r2_direct2
-- has no earlier session: inside one pgTAP transaction now() is frozen, so a
-- session settled earlier in this file would clip any backdated interval.)
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '73000000-0000-4000-8000-0000000000a2'), 0,
  'the GROUP assignment row itself receives no credit (it is not a person''s progress)');             -- 1
SELECT tests.authenticate_as('r2_direct2');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_direct2'), '73000000-0000-4000-8000-00000000000a')$$,
  'direct assignee 2: start succeeds');                                                               -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '15 minutes'
 WHERE user_id = pg_temp.uid('r2_direct2') AND session_end IS NULL;
SELECT tests.authenticate_as('r2_direct2');
SELECT ok(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_direct2') AND session_end IS NULL)),
  'direct assignee 2: end returns TRUE');                                                             -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '73000000-0000-4000-8000-0000000000a4'), 15,
  'direct assignee 2: the assignment row is credited 15 (existing reporting keeps its numbers)');     -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_direct2')), 15,
  'direct assignee 2: the own-progress row mirrors the same 15');                                     -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress), 1,
  'direct assignee 2: sees only their own progress row (isolation)');                                 -- 1
RESET ROLE;

-- Later member: joins the community after the assignment exists.
SELECT tests.authenticate_as('r2_later');
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_later'), '73000000-0000-4000-8000-00000000000a')$$,
  '42501', 'User is not assigned to this learning path', 'later member: before joining, cannot start'); -- 1
RESET ROLE;
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (pg_temp.uid('r2_later'), 'docente', 9731, '73000000-0000-4000-8000-00000000c001', true);
SELECT tests.authenticate_as('r2_later');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_later'), '73000000-0000-4000-8000-00000000000a')$$,
  'later member: after joining, start succeeds');                                                     -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_later')), 1,
  'later member: has their own progress row');                                                        -- 1
RESET ROLE;

-- Membership loss: credit stays, authority does not.
SELECT tests.authenticate_as('r2_leaver');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_leaver'), '73000000-0000-4000-8000-00000000000a')$$,
  'leaver: as an active member, start succeeds');                                                     -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '12 minutes'
 WHERE user_id = pg_temp.uid('r2_leaver') AND session_end IS NULL;
SELECT tests.authenticate_as('r2_leaver');
SELECT ok(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r2_leaver') AND session_end IS NULL)),
  'leaver: end returns TRUE');                                                                        -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_leaver')), 12,
  'leaver: 12 minutes credited while a member');                                                      -- 1
RESET ROLE;
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('r2_leaver');
SELECT tests.authenticate_as('r2_leaver');
SELECT ok(NOT public.auth_is_learning_path_assignee('73000000-0000-4000-8000-00000000000a'),
  'leaver: after membership ends, no longer an assignee');                                            -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r2_leaver'), '73000000-0000-4000-8000-00000000000a')$$,
  '42501', 'User is not assigned to this learning path', 'leaver: cannot start a new session');        -- 1
SELECT is((SELECT count(*)::int FROM public.learning_paths), 0, 'leaver: sees no template');           -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_courses), 0, 'leaver: sees no course link'); -- 1
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '73000000-0000-4000-8000-000000000c01'), 0,
  'leaver: the path''s course is invisible (the progress row is not an access grant)');               -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r2_leaver')), 12,
  'leaver: their own 12 credited minutes remain readable to them (credit is not discarded)');         -- 1
RESET ROLE;

-- Isolation and admin visibility
SELECT tests.authenticate_as('r2_outsider');
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress), 1,
  'direct assignee (outsider fixture): sees only their own progress row');                            -- 1
RESET ROLE;
SELECT tests.authenticate_as('r2_admin');
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress WHERE path_id = '73000000-0000-4000-8000-00000000000a'), 6,
  'admin: sees every progress row of the path (direct, direct 2, outsider-fixture, member, later, leaver)'); -- 1
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_user_progress$$, '42501', NULL,
  'anon: cannot read progress rows');                                                                 -- 1
RESET ROLE;

-- ============================================================================
-- 5. R2-01 — live probes
-- ============================================================================
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT * FROM public.get_all_auth_users()$$, '42501', NULL,
  'anon: get_all_auth_users is not executable (Codex reproduction: ANON_SYNTHETIC_ACCOUNT_COUNT=1)'); -- 1
SELECT throws_ok($$SELECT public.start_dev_impersonation('73000000-0000-4000-8000-000000000001', 'admin')$$, '42501', NULL,
  'anon: start_dev_impersonation is not executable');                                                 -- 1
SELECT throws_ok($$SELECT * FROM public.get_active_dev_impersonation('73000000-0000-4000-8000-000000000001')$$, '42501', NULL,
  'anon: get_active_dev_impersonation is not executable');                                            -- 1
SELECT throws_ok($$SELECT * FROM public.get_reportable_users('73000000-0000-4000-8000-000000000001')$$, '42501', NULL,
  'anon: get_reportable_users is not executable');                                                    -- 1
SELECT throws_ok($$SELECT * FROM public.get_meeting_stats('73000000-0000-4000-8000-00000000bb01')$$, '42501', NULL,
  'anon: get_meeting_stats is not executable');                                                       -- 1
SELECT throws_ok($$SELECT public.create_notification('73000000-0000-4000-8000-000000000001', 't', 'x', 'y')$$, '42501', NULL,
  'anon: create_notification is not executable');                                                     -- 1
SELECT throws_ok($$SELECT public.award_course_completion_badge('73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000c01', 'c')$$, '42501', NULL,
  'anon: award_course_completion_badge is not executable');                                           -- 1
SELECT throws_ok($$SELECT public.update_overdue_status()$$, '42501', NULL,
  'anon: update_overdue_status is not executable');                                                   -- 1
RESET ROLE;

-- authenticated, NOT a member of workspace bb01 (r2_direct has no community)
SELECT tests.authenticate_as('r2_direct');
SELECT throws_ok($$SELECT * FROM public.get_all_auth_users()$$, '42501', NULL,
  'authenticated: get_all_auth_users is not executable');                                             -- 1
SELECT throws_ok($$SELECT public.refresh_user_roles_cache()$$, '42501', NULL,
  'authenticated: refresh_user_roles_cache is not executable');                                       -- 1
SELECT throws_ok($$SELECT * FROM public.get_meeting_stats('73000000-0000-4000-8000-00000000bb01')$$, '42501', 'No access to this workspace',
  'authenticated non-member: get_meeting_stats of a foreign workspace is refused');                   -- 1
SELECT throws_ok($$SELECT public.get_document_statistics('73000000-0000-4000-8000-00000000bb01')$$, '42501', 'No access to this workspace',
  'authenticated non-member: get_document_statistics of a foreign workspace is refused');             -- 1
SELECT throws_ok($$SELECT * FROM public.get_recent_document_activity('73000000-0000-4000-8000-00000000bb01', 5)$$, '42501', 'No access to this workspace',
  'authenticated non-member: get_recent_document_activity of a foreign workspace is refused');        -- 1
SELECT throws_ok($$SELECT public.get_folder_breadcrumb('73000000-0000-4000-8000-00000000d101')$$, '42501', 'No access to this workspace',
  'authenticated non-member: get_folder_breadcrumb of a foreign workspace''s folder is refused');     -- 1
SELECT is(public.get_folder_breadcrumb('73000000-0000-4000-8000-00000000d1ff')::text, '[]',
  'authenticated: an unknown folder answers [] (nothing disclosed)');                                 -- 1
SELECT throws_ok($$SELECT * FROM public.get_overdue_items('73000000-0000-4000-8000-00000000bb01', NULL)$$, '42501', 'No access to this workspace',
  'authenticated non-member: get_overdue_items for a foreign workspace is refused');                  -- 1
SELECT throws_ok($$SELECT * FROM public.get_overdue_items(NULL, pg_temp.uid('r2_member'))$$, '42501', 'Caller-supplied user does not match the authenticated user',
  'authenticated: get_overdue_items for ANOTHER user is refused');                                    -- 1
SELECT lives_ok($$SELECT * FROM public.get_overdue_items(NULL, NULL)$$,
  'authenticated: get_overdue_items with no filter is allowed (scoped to the caller''s own items)');  -- 1
SELECT throws_ok($$SELECT * FROM public.get_user_badges(pg_temp.uid('r2_member'))$$, '42501', 'Caller-supplied user does not match the authenticated user',
  'authenticated: get_user_badges(another user) is refused');                                         -- 1
SELECT lives_ok($$SELECT * FROM public.get_user_badges(pg_temp.uid('r2_direct'))$$,
  'authenticated: get_user_badges(self) works');                                                      -- 1
SELECT throws_ok($$SELECT public.get_unread_notification_count(pg_temp.uid('r2_member'))$$, '42501', NULL,
  'authenticated: get_unread_notification_count(another user) is refused');                           -- 1
SELECT is(public.get_unread_notification_count(pg_temp.uid('r2_direct')), 1,
  'authenticated: get_unread_notification_count(self) counts the own unread notification');           -- 1
SELECT throws_ok($$SELECT public.mark_all_notifications_read(pg_temp.uid('r2_member'))$$, '42501', NULL,
  'authenticated: mark_all_notifications_read(another user) is refused');                             -- 1
SELECT is(public.mark_all_notifications_read(pg_temp.uid('r2_direct')), 1,
  'authenticated: mark_all_notifications_read(self) marks the own notification');                     -- 1
SELECT throws_ok($$SELECT public.mark_notification_read('73000000-0000-4000-8000-00000000d201', pg_temp.uid('r2_member'))$$, '42501', NULL,
  'authenticated: mark_notification_read(another user''s) is refused');                               -- 1
SELECT throws_ok(
  $$SELECT public.create_activity('73000000-0000-4000-8000-00000000bb01', 'meeting_created', 'meeting', pg_temp.uid('r2_direct'))$$,
  '42501', 'No access to this workspace', 'authenticated non-member: create_activity in a foreign workspace is refused'); -- 1
SELECT throws_ok(
  $$SELECT public.add_feedback_activity('73000000-0000-4000-8000-00000000d301', 'forged', pg_temp.uid('r2_member'), true)$$,
  '42501', NULL, 'authenticated: add_feedback_activity called directly (outside a trigger) is refused'); -- 1
SELECT lives_ok($$SELECT public.increment_document_counter('73000000-0000-4000-8000-00000000dfff', 'view', pg_temp.uid('r2_direct'))$$,
  'authenticated: increment_document_counter on an unknown document is a no-op (nothing disclosed)'); -- 1
SELECT throws_ok($$SELECT public.increment_document_counter('73000000-0000-4000-8000-00000000dfff', 'bogus', NULL)$$, '22023', NULL,
  'authenticated: an unknown counter type is rejected');                                              -- 1
SELECT lives_ok($$SELECT public.update_overdue_status()$$,
  'authenticated: update_overdue_status (deterministic, no caller input) still runs for the browser caller'); -- 1
RESET ROLE;

-- authenticated MEMBER of workspace bb01
SELECT tests.authenticate_as('r2_member');
SELECT is((SELECT total_meetings FROM public.get_meeting_stats('73000000-0000-4000-8000-00000000bb01')), 1::bigint,
  'member: get_meeting_stats of the own workspace answers');                                          -- 1
SELECT is((public.get_document_statistics('73000000-0000-4000-8000-00000000bb01') ->> 'total_folders')::int, 1,
  'member: get_document_statistics of the own workspace answers');                                    -- 1
SELECT is(public.get_folder_breadcrumb('73000000-0000-4000-8000-00000000d101')::jsonb, '[{"id": "73000000-0000-4000-8000-00000000d101", "name": "R2 folder"}]'::jsonb,
  'member: get_folder_breadcrumb of the own workspace answers');                                      -- 1
SELECT throws_ok($$SELECT * FROM public.get_meeting_stats('73000000-0000-4000-8000-00000000bb02')$$, '42501', 'No access to this workspace',
  'member: another community''s workspace is still refused');                                         -- 1
SELECT throws_ok(
  $$SELECT public.create_activity('73000000-0000-4000-8000-00000000bb01', 'meeting_created', 'meeting', pg_temp.uid('r2_direct'))$$,
  '42501', 'Caller-supplied user does not match the authenticated user',
  'member: create_activity naming ANOTHER user as actor is refused (Codex: spoofable actor)');        -- 1
SELECT isnt(public.create_activity('73000000-0000-4000-8000-00000000bb01', 'meeting_created', 'meeting', pg_temp.uid('r2_member'), NULL, 'R2 activity'), NULL,
  'member: create_activity as themselves succeeds');                                                  -- 1
SELECT isnt(public.create_activity('73000000-0000-4000-8000-00000000bb01', 'meeting_created', 'meeting', NULL, NULL, 'R2 activity 2'), NULL,
  'member: create_activity with a NULL actor defaults to themselves');                                -- 1
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.activity_feed WHERE title LIKE 'R2 activity%' AND user_id = pg_temp.uid('r2_member')), 2,
  'both activities are attributed to the authenticated member');                                      -- 1
SELECT is((SELECT count(*)::int FROM public.activity_feed WHERE title LIKE 'R2 activity%' AND user_id <> pg_temp.uid('r2_member')), 0,
  'no activity was attributed to anyone else');                                                       -- 1

-- Feedback trigger path preserved: an admin's status change (SECURITY INVOKER
-- trigger) still writes the system activity through add_feedback_activity.
SELECT tests.authenticate_as('r2_admin');
SELECT is(pg_temp.rows_affected($$UPDATE public.platform_feedback SET status = 'seen' WHERE id = '73000000-0000-4000-8000-00000000d301'$$), 1,
  'admin: status change on feedback succeeds');                                                       -- 1
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.feedback_activity WHERE feedback_id = '73000000-0000-4000-8000-00000000d301' AND is_system_message), 1,
  'the feedback_status_change trigger still recorded the system activity via add_feedback_activity'); -- 1

-- Backend keeps its access
SELECT pg_temp.set_service();
SELECT ok((SELECT count(*) FROM public.get_all_auth_users()) >= 6, 'service_role: get_all_auth_users still lists accounts'); -- 1
-- get_reportable_users has a PRE-EXISTING body defect (42702: "user_id" is
-- ambiguous between a RETURNS TABLE column and user_roles.user_id) that makes
-- it fail for every caller; this round changes its grants only, so the probe
-- pins that the backend still reaches the (unchanged) body.
SELECT throws_ok($$SELECT * FROM public.get_reportable_users(pg_temp.uid('r2_admin'))$$, '42702', NULL,
  'service_role: get_reportable_users is executable (its pre-existing body defect is unchanged)');    -- 1
-- refresh_user_roles_cache is not probed live: on the migrated local schema the
-- materialized view has no unique index (and starts unpopulated), so its
-- REFRESH ... CONCURRENTLY fails for every caller before and after this round
-- (pre-existing; recorded in the inventory). Its grants are pinned in §1.
SELECT lives_ok($$SELECT * FROM public.get_meeting_stats('73000000-0000-4000-8000-00000000bb01')$$, 'service_role: get_meeting_stats runs without a member identity'); -- 1
SELECT lives_ok($$SELECT * FROM public.get_overdue_items(NULL, NULL)$$, 'service_role: get_overdue_items unfiltered runs'); -- 1
SELECT throws_ok($$SELECT public.start_dev_impersonation(pg_temp.uid('r2_direct'), 'admin')$$, 'P0001', 'User is not authorized as a developer',
  'service_role: start_dev_impersonation is executable and still validates the dev id');              -- 1
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
