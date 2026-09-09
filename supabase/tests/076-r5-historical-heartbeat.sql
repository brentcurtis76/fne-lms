-- R5-01 durable historical distrust: actual stored state and credit across a
-- finite deadline, with no intervening session mutation. Synthetic; rollback.
BEGIN;
SELECT no_plan();
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


SELECT ok(NOT has_column_privilege('authenticated', 'public.learning_path_progress_sessions', 'heartbeat_trust_ceiling', 'UPDATE'), 'ceiling UPDATE is protected');
SELECT ok(NOT has_column_privilege('authenticated', 'public.learning_path_progress_sessions', 'heartbeat_trust_ceiling', 'INSERT'), 'ceiling INSERT is protected');
SELECT tests.authenticate_as('r4_forge');
SELECT public.start_learning_path_session(pg_temp.uid('r4_forge'), '75000000-0000-4000-8000-00000000000a');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET heartbeat_trust_ceiling='infinity' WHERE user_id=auth.uid()$$, '42501', NULL, 'direct caller cannot forge trust');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET session_start=now()-interval '1 day' WHERE user_id=auth.uid()$$, '42501', NULL, 'timing remains protected');
RESET ROLE;
-- Model pre-guard stored values with a fixed migration ceiling. Actual migration
-- initialization and rollback are separately exercised in the prefix rehearsal.
SET LOCAL session_replication_role=replica;
DELETE FROM public.learning_path_progress_sessions WHERE user_id=pg_temp.uid('r4_forge');
INSERT INTO public.learning_path_progress_sessions(user_id,path_id,activity_type,session_start,last_heartbeat,heartbeat_trust_ceiling)
SELECT pg_temp.uid(k), '75000000-0000-4000-8000-00000000000a', 'path_view',
       now()-interval '10 minutes', clock_timestamp()+interval '1 second', now()
FROM unnest(ARRAY['r4_forge','r4_group','r4_legacy','r4_valid']) k;
INSERT INTO public.learning_path_progress_sessions(user_id,path_id,activity_type,session_start,last_heartbeat,heartbeat_trust_ceiling)
VALUES (pg_temp.uid('r4_seq'),'75000000-0000-4000-8000-00000000000a','path_view',now()-interval '10 minutes','infinity',now());
SET LOCAL session_replication_role=origin;
CREATE TEMP TABLE historical_snapshot AS SELECT id,last_heartbeat,heartbeat_trust_ceiling,session_start FROM public.learning_path_progress_sessions;
SELECT ok(bool_and(last_heartbeat>clock_timestamp()), 'before deadline: finite historical marks are still future') FROM historical_snapshot WHERE isfinite(last_heartbeat);
SELECT ok(bool_and(public.lp_last_authorized_heartbeat(last_heartbeat,session_start,heartbeat_trust_ceiling)=session_start), 'before deadline: all suspect marks resolve to start') FROM historical_snapshot;
-- Synchronize to the stored deadline, not an assumed machine execution speed.
SELECT pg_sleep(greatest(0,extract(epoch FROM ((SELECT max(last_heartbeat) FROM historical_snapshot WHERE isfinite(last_heartbeat))-clock_timestamp())))+0.05);
SELECT ok(bool_and(last_heartbeat<clock_timestamp()), 'after deadline: finite marks are now past') FROM historical_snapshot WHERE isfinite(last_heartbeat);
SELECT ok(bool_and(s.last_heartbeat=h.last_heartbeat AND s.heartbeat_trust_ceiling=h.heartbeat_trust_ceiling AND s.session_end IS NULL), 'same raw timestamp and ceiling, session still open') FROM public.learning_path_progress_sessions s JOIN historical_snapshot h USING(id);
SELECT ok(bool_and(public.lp_last_authorized_heartbeat(last_heartbeat,session_start,heartbeat_trust_ceiling)=session_start), 'after deadline: unchanged suspect marks STILL resolve to start') FROM historical_snapshot;
SELECT ok(bool_and(public.lp_last_authorized_heartbeat(last_heartbeat,session_start)=session_start), 'exact two-argument review probe never grants raw timestamps trust') FROM historical_snapshot;

DELETE FROM public.learning_path_assignments WHERE user_id=pg_temp.uid('r4_forge');
UPDATE public.user_roles SET is_active=false WHERE user_id=pg_temp.uid('r4_group');
SELECT tests.authenticate_as('r4_forge');
SELECT throws_ok($$SELECT public.update_session_heartbeat(pg_temp.open_session('r4_forge'))$$, '42501', NULL, 'direct revocation refuses fresh heartbeat');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_forge')), 'direct revoked end succeeds');
SELECT ok(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id=auth.uid())), 'repeated direct revoked end succeeds');
RESET ROLE;
SELECT tests.authenticate_as('r4_group');
SELECT throws_ok($$SELECT public.update_session_heartbeat(pg_temp.open_session('r4_group'))$$, '42501', NULL, 'group revocation refuses fresh heartbeat');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_group')), 'group revoked end succeeds');
RESET ROLE;
SELECT ok(bool_and(session_end=session_start AND time_spent_minutes=0 AND credited_minutes=0 AND settled_at IS NOT NULL), 'direct/group revoked stored ends and credit remain zero') FROM public.learning_path_progress_sessions WHERE user_id IN(pg_temp.uid('r4_forge'),pg_temp.uid('r4_group'));
SELECT is(sum(total_time_spent_minutes)::int,0,'revoked progress records preserve zero, no unauthorized minutes') FROM public.learning_path_user_progress WHERE user_id IN(pg_temp.uid('r4_forge'),pg_temp.uid('r4_group'));

-- New legitimate old-app direct UPDATE replaces BOTH raw value and ceiling.
SELECT tests.authenticate_as('r4_valid');
SELECT lives_ok($$UPDATE public.learning_path_progress_sessions SET last_heartbeat='infinity',updated_at='infinity' WHERE user_id=auth.uid()$$, 'authorized old-app heartbeat accepted');
RESET ROLE;
SELECT ok(last_heartbeat=now() AND heartbeat_trust_ceiling=now(), 'authorized write establishes server mark and ceiling together') FROM public.learning_path_progress_sessions WHERE user_id=pg_temp.uid('r4_valid');
DELETE FROM public.learning_path_assignments WHERE user_id=pg_temp.uid('r4_valid');
SELECT tests.authenticate_as('r4_valid');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r4_valid')), 'revoked end after fresh legitimate heartbeat');
RESET ROLE;
SELECT ok(session_end=last_heartbeat AND time_spent_minutes=10 AND credited_minutes=10, 'fresh legitimate mark preserves ten earned minutes') FROM public.learning_path_progress_sessions WHERE user_id=pg_temp.uid('r4_valid');
SELECT is(total_time_spent_minutes,10,'earned progress survives revocation') FROM public.learning_path_user_progress WHERE user_id=pg_temp.uid('r4_valid');

SELECT pg_temp.set_service();
SELECT public.close_stale_learning_path_sessions(now()-interval '5 minutes');
SELECT public.close_stale_learning_path_sessions(now()-interval '5 minutes');
RESET ROLE;
SELECT ok(bool_and(session_end=session_start AND time_spent_minutes=0 AND credited_minutes=0 AND settled_at IS NOT NULL), 'maintenance and repeat: finite expired + infinity stored zero-credit closure') FROM public.learning_path_progress_sessions WHERE user_id IN(pg_temp.uid('r4_legacy'),pg_temp.uid('r4_seq'));
SELECT is(sum(total_time_spent_minutes)::int,0,'maintenance preserves assignment totals') FROM public.learning_path_assignments WHERE user_id IN(pg_temp.uid('r4_legacy'),pg_temp.uid('r4_seq'));
SELECT is(sum(total_time_spent_minutes)::int,0,'maintenance preserves progress totals') FROM public.learning_path_user_progress WHERE user_id IN(pg_temp.uid('r4_legacy'),pg_temp.uid('r4_seq'));

-- Old service-role cleanup can write a closed interval, but cannot turn an
-- ineligible historical value into credit for the later settlement RPC.
SET LOCAL session_replication_role=replica;
INSERT INTO public.learning_path_progress_sessions(user_id,path_id,activity_type,session_start,last_heartbeat,heartbeat_trust_ceiling)
VALUES(pg_temp.uid('r4_legacy'),'75000000-0000-4000-8000-00000000000a','path_view',now()-interval '30 minutes',now()-interval '20 minutes',now()-interval '25 minutes');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.set_service();
UPDATE public.learning_path_progress_sessions SET session_end=last_heartbeat,time_spent_minutes=10 WHERE session_end IS NULL;
SELECT public.close_stale_learning_path_sessions(now()-interval '5 minutes');
RESET ROLE;
SELECT ok(bool_and(session_end=session_start AND time_spent_minutes=0 AND credited_minutes=0), 'old maintenance direct close cannot launder an expired historical timestamp') FROM public.learning_path_progress_sessions WHERE user_id=pg_temp.uid('r4_legacy');
SELECT * FROM finish();
ROLLBACK;
