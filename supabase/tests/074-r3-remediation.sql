-- =============================================================================
-- 074-r3-remediation.sql — Codex re-review R3 (rls-rereview-r2-2026-09-07.md):
-- the corrections folded into 20260907120000 / 20260907120300, reproduced
-- failure by failure.
--
--   1. catalog: lock-order helper and hierarchy/seed triggers installed, no
--      application role may execute the internal helpers
--   2. R3-01 — assignment authority is re-checked on an EXISTING session:
--      group membership revoked / direct assignment removed while a session is
--      open -> activity, sequence advance, completion and heartbeat refused
--      (42501) with the state unchanged; end still settles (clipped to the last
--      authorized heartbeat); the earned credit stays; a valid assignee and the
--      literal admin keep working; re-assignment restores authority
--   3. R3-03 — folder ancestry stays inside the authorized workspace: a valid
--      multi-level hierarchy; cross-workspace parent on INSERT/UPDATE refused
--      for members and backend alike; a pre-existing inconsistent row never
--      discloses its foreign ancestor; a legacy cycle terminates; a new cycle
--      is refused; backend/service breadcrumb works
--   4. R3-04 — progress survives assignment-source changes: group-only ->
--      +direct (copied, not summed, not reset), direct+group -> group-only,
--      existing direct history before a progress row exists, later settlement
--      and retries, progress never grants access
--   5. R3-02 — lock protocol facts observable in one session: end / activity /
--      maintenance hold the per-(user, path) advisory lock (pg_locks) and the
--      session row lock is taken only afterwards
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(107);

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
-- TRUE when this backend holds the per-(user, path) transaction advisory lock
-- (pg_advisory_xact_lock(int, int): classid = key1, objid = key2).
CREATE OR REPLACE FUNCTION pg_temp.holds_pair_lock(p_user uuid, p_path uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_locks
     WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid()
       AND classid = hashtext(p_user::text)::int::oid
       AND objid = hashtext(p_path::text)::int::oid
  )
$$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('r3_admin');
SELECT tests.create_supabase_user('r3_member');    -- group-only member whose membership is revoked mid-session
SELECT tests.create_supabase_user('r3_direct');    -- direct assignee whose assignment is removed mid-session
SELECT tests.create_supabase_user('r3_valid');     -- direct assignee, stays valid
SELECT tests.create_supabase_user('r3_group2');    -- group-only member who later gets a direct assignment
SELECT tests.create_supabase_user('r3_both');      -- direct + group member who loses the direct row
SELECT tests.create_supabase_user('r3_history');   -- direct assignee with history before any progress row
SELECT tests.create_supabase_user('r3_ws');        -- member of workspace bb01 (folders)
SELECT tests.create_supabase_user('r3_foreign');   -- member of workspace bb02 (folders)

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['r3_admin','r3_member','r3_direct','r3_valid','r3_group2','r3_both','r3_history','r3_ws','r3_foreign']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9741, 'R3 school (pgTAP 074)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('74000000-0000-4000-8000-00000000c001', 9741, 'R3 community'),
  ('74000000-0000-4000-8000-00000000c002', 9741, 'R3 other community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('74000000-0000-4000-8000-00000000bb01', '74000000-0000-4000-8000-00000000c001', 'R3 workspace'),
  ('74000000-0000-4000-8000-00000000bb02', '74000000-0000-4000-8000-00000000c002', 'R3 other workspace');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('r3_admin'),   'admin',   NULL, NULL, true),
  (pg_temp.uid('r3_member'),  'docente', 9741, '74000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r3_direct'),  'docente', 9741, NULL, true),
  (pg_temp.uid('r3_valid'),   'docente', 9741, NULL, true),
  (pg_temp.uid('r3_group2'),  'docente', 9741, '74000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r3_both'),    'docente', 9741, '74000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r3_history'), 'docente', 9741, NULL, true),
  (pg_temp.uid('r3_ws'),      'docente', 9741, '74000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('r3_foreign'), 'docente', 9741, '74000000-0000-4000-8000-00000000c002', true);

INSERT INTO public.instructors (id, full_name) VALUES ('74000000-0000-4000-8000-00000000f001', 'R3 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('74000000-0000-4000-8000-000000000c01', 'R3 course 1', 'R3 course 1', '74000000-0000-4000-8000-00000000f001'),
  ('74000000-0000-4000-8000-000000000c02', 'R3 course 2', 'R3 course 2', '74000000-0000-4000-8000-00000000f001');
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('74000000-0000-4000-8000-00000000000a', 'R3 path A', 'direct + group', pg_temp.uid('r3_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('74000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000c01', 1),
  ('74000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000c02', 2);
INSERT INTO public.learning_path_assignments (id, path_id, user_id, group_id, assigned_by) VALUES
  ('74000000-0000-4000-8000-0000000000a1', '74000000-0000-4000-8000-00000000000a', pg_temp.uid('r3_direct'), NULL, pg_temp.uid('r3_admin')),
  ('74000000-0000-4000-8000-0000000000a2', '74000000-0000-4000-8000-00000000000a', pg_temp.uid('r3_valid'),  NULL, pg_temp.uid('r3_admin')),
  ('74000000-0000-4000-8000-0000000000a3', '74000000-0000-4000-8000-00000000000a', pg_temp.uid('r3_both'),   NULL, pg_temp.uid('r3_admin')),
  ('74000000-0000-4000-8000-0000000000a9', '74000000-0000-4000-8000-00000000000a', NULL, '74000000-0000-4000-8000-00000000bb01', pg_temp.uid('r3_admin'));

-- ============================================================================
-- 1. Catalog
-- ============================================================================
SELECT ok(NOT has_function_privilege(r.role, 'public.lp_lock_session_pairs(uuid[])', 'EXECUTE'),
  format('%s cannot execute internal lp_lock_session_pairs', r.role))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role) ORDER BY r.role;                     -- 3
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.document_folders'::regclass
             AND tgname = 'document_folders_parent_guard' AND NOT tgisinternal AND tgenabled <> 'D'),
  'R3-03: the document_folders parent/workspace guard is installed and enabled');                     -- 1
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.learning_path_assignments'::regclass
             AND tgname = 'learning_path_assignments_seed_from_progress' AND NOT tgisinternal AND tgenabled <> 'D'),
  'R3-04: new direct assignment rows are seeded from existing own progress (trigger installed)');     -- 1
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.learning_path_assignments'::regclass
             AND tgname = 'learning_path_assignments_ensure_progress' AND NOT tgisinternal AND tgenabled <> 'D'),
  'R3-04: a direct assignment row without a progress row gets one (trigger installed)');              -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress
            WHERE user_id IN (pg_temp.uid('r3_direct'), pg_temp.uid('r3_valid'), pg_temp.uid('r3_both'))), 3,
  'R3-04: the three direct fixture rows already have their own progress row (ensure trigger)');       -- 1

-- ============================================================================
-- 2. R3-01 — authority is re-checked on an existing session
-- ============================================================================
-- (a) group member: membership revoked while the session is open
SELECT tests.authenticate_as('r3_member');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r3_member'), '74000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'member: start succeeds while the membership is active');                                           -- 1
RESET ROLE;
-- Backdate server-side: started 20 minutes ago, last authorized heartbeat 10 minutes ago.
UPDATE public.learning_path_progress_sessions
   SET session_start = now() - interval '20 minutes', last_heartbeat = now() - interval '10 minutes'
 WHERE id = pg_temp.open_session('r3_member');
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('r3_member');
SELECT tests.authenticate_as('r3_member');
SELECT ok(NOT public.auth_is_learning_path_assignee('74000000-0000-4000-8000-00000000000a'),
  'member: after revocation, no longer an assignee (Codex reproduction step 3)');                     -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(pg_temp.open_session('r3_member'), 'path_complete', NULL)$$,
  '42501', 'User is not assigned to this learning path',
  'member: path_complete on the still-open session is REFUSED (Codex reproduction step 4: was ok=true)'); -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(pg_temp.open_session('r3_member'), 'course_start', '74000000-0000-4000-8000-000000000c02')$$,
  '42501', NULL, 'member: course_start (sequence advance) is refused too');                            -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(pg_temp.open_session('r3_member'), 'path_view', NULL)$$,
  '42501', NULL, 'member: plain activity is refused too');                                            -- 1
SELECT throws_ok(
  $$SELECT public.update_session_heartbeat(pg_temp.open_session('r3_member'))$$,
  '42501', 'User is not assigned to this learning path',
  'member: a heartbeat (which would extend the creditable interval) is refused');                     -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r3_member'), '74000000-0000-4000-8000-00000000000a')$$,
  '42501', NULL, 'member: a new start is refused');                                                   -- 1
RESET ROLE;
SELECT is((SELECT completed_at FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_member')), NULL,
  'member: completed_at was NOT written');                                                            -- 1
SELECT is((SELECT current_course_sequence FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_member')), 1,
  'member: the course sequence did not advance');                                                     -- 1
SELECT is((SELECT (activity_type, course_id, last_heartbeat < now() - interval '9 minutes')
             FROM public.learning_path_progress_sessions WHERE id = pg_temp.open_session('r3_member')),
  ('course_start'::varchar, '74000000-0000-4000-8000-000000000c01'::uuid, true),
  'member: the open session row is unchanged (activity, course, heartbeat)');                          -- 1
-- Final settlement is still permitted, clipped to the last authorized heartbeat.
SELECT tests.authenticate_as('r3_member');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_member')),
  'member: end still returns TRUE (final settlement is permitted)');                                  -- 1
RESET ROLE;
SELECT is((SELECT time_spent_minutes FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r3_member')), 10,
  'member: the session closed at the last authorized heartbeat (10 minutes, not the 20 to now)');     -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_member')), 10,
  'member: the 10 authorized minutes are credited to their own progress row (credit not discarded)'); -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r3_member') AND settled_at IS NULL), 0,
  'member: the session is settled');                                                                  -- 1
SELECT tests.authenticate_as('r3_member');
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r3_member')), 'path_complete', NULL)$$,
  '42501', NULL, 'member: activity on the (now closed) session is still refused by authority first'); -- 1
RESET ROLE;

-- (b) direct assignee: assignment removed while the session is open
SELECT tests.authenticate_as('r3_direct');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r3_direct'), '74000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'direct: start succeeds while assigned');                                                           -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_direct'), 'course_start', '74000000-0000-4000-8000-000000000c02')) ->> 'ok')::boolean, true,
  'direct: activity works while assigned (sequence -> 2)');                                           -- 1
RESET ROLE;
DELETE FROM public.learning_path_assignments WHERE id = '74000000-0000-4000-8000-0000000000a1';
SELECT tests.authenticate_as('r3_direct');
SELECT ok(NOT public.auth_is_learning_path_assignee('74000000-0000-4000-8000-00000000000a'),
  'direct: after the assignment is removed, no longer an assignee');                                  -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(pg_temp.open_session('r3_direct'), 'path_complete', NULL)$$,
  '42501', 'User is not assigned to this learning path',
  'direct: path_complete on the open session is refused');                                            -- 1
SELECT throws_ok(
  $$SELECT public.record_learning_path_activity(pg_temp.open_session('r3_direct'), 'course_start', '74000000-0000-4000-8000-000000000c01')$$,
  '42501', NULL, 'direct: course_start on the open session is refused');                              -- 1
SELECT throws_ok(
  $$SELECT public.update_session_heartbeat(pg_temp.open_session('r3_direct'))$$,
  '42501', NULL, 'direct: heartbeat is refused');                                                     -- 1
RESET ROLE;
SELECT is((SELECT (completed_at IS NULL, current_course_sequence) FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_direct')),
  (true, 2), 'direct: own progress unchanged (no completion, sequence still 2)');                     -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r3_direct') AND session_end IS NULL), 1,
  'direct: the session is still open (nothing was closed by the refusals)');                          -- 1
-- Re-assignment restores authority and the progress row is intact (seeded copy, not reset).
SELECT tests.authenticate_as('r3_admin');
SELECT lives_ok(
  $$SELECT public.batch_assign_learning_path('74000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('r3_direct')], NULL, pg_temp.uid('r3_admin'))$$,
  'admin: re-assigns the direct learner');                                                            -- 1
RESET ROLE;
SELECT is((SELECT current_course_sequence FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r3_direct') AND path_id = '74000000-0000-4000-8000-00000000000a'), 2,
  'direct: the NEW direct row is seeded with the sequence earned before (2)');                        -- 1
SELECT tests.authenticate_as('r3_direct');
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_direct'), 'path_complete', NULL)) ->> 'ok')::boolean, true,
  'direct: after re-assignment, activity on the same open session works again');                      -- 1
RESET ROLE;
SELECT isnt((SELECT completed_at FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_direct')), NULL,
  'direct: completion recorded once authority is back');                                              -- 1

-- (c) a valid assignee and the literal admin are unaffected
SELECT tests.authenticate_as('r3_valid');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r3_valid'), '74000000-0000-4000-8000-00000000000a')$$,
  'valid assignee: start works');                                                                     -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_valid'), 'course_start', '74000000-0000-4000-8000-000000000c02')) ->> 'ok')::boolean, true,
  'valid assignee: activity works');                                                                  -- 1
SELECT ok(public.update_session_heartbeat(pg_temp.open_session('r3_valid')), 'valid assignee: heartbeat works'); -- 1
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_valid')), 'valid assignee: end works');     -- 1
RESET ROLE;
SELECT tests.authenticate_as('r3_admin');
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('r3_admin'), '74000000-0000-4000-8000-00000000000a')$$,
  'admin: may start a session on a path they are not assigned to (intended exception)');              -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_admin'), 'path_view', NULL)) ->> 'ok')::boolean, true,
  'admin: activity works without an assignment (intended exception)');                                -- 1
SELECT ok(public.update_session_heartbeat(pg_temp.open_session('r3_admin')), 'admin: heartbeat works without an assignment'); -- 1
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_admin')), 'admin: end works');    -- 1
RESET ROLE;

-- ============================================================================
-- 3. R3-03 — folder ancestry stays inside the authorized workspace
-- ============================================================================
-- Foreign workspace content (bb02) and a valid three-level hierarchy in bb01.
INSERT INTO public.document_folders (id, workspace_id, folder_name, created_by) VALUES
  ('74000000-0000-4000-8000-00000000d201', '74000000-0000-4000-8000-00000000bb02', 'SYNTHETIC FOREIGN FOLDER', pg_temp.uid('r3_foreign'));
SELECT tests.authenticate_as('r3_ws');
SELECT lives_ok(
  $$INSERT INTO public.document_folders (id, workspace_id, folder_name, created_by)
    VALUES ('74000000-0000-4000-8000-00000000d101', '74000000-0000-4000-8000-00000000bb01', 'R3 root', pg_temp.uid('r3_ws'))$$,
  'member: creates a root folder in the own workspace');                                              -- 1
SELECT lives_ok(
  $$INSERT INTO public.document_folders (id, workspace_id, folder_name, parent_folder_id, created_by)
    VALUES ('74000000-0000-4000-8000-00000000d102', '74000000-0000-4000-8000-00000000bb01', 'R3 child', '74000000-0000-4000-8000-00000000d101', pg_temp.uid('r3_ws'))$$,
  'member: creates a child folder under the root (same workspace)');                                  -- 1
SELECT lives_ok(
  $$INSERT INTO public.document_folders (id, workspace_id, folder_name, parent_folder_id, created_by)
    VALUES ('74000000-0000-4000-8000-00000000d103', '74000000-0000-4000-8000-00000000bb01', 'R3 grandchild', '74000000-0000-4000-8000-00000000d102', pg_temp.uid('r3_ws'))$$,
  'member: creates a grandchild folder (same workspace)');                                            -- 1
SELECT is(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d103')::jsonb,
  '[{"id": "74000000-0000-4000-8000-00000000d101", "name": "R3 root"}, {"id": "74000000-0000-4000-8000-00000000d102", "name": "R3 child"}, {"id": "74000000-0000-4000-8000-00000000d103", "name": "R3 grandchild"}]'::jsonb,
  'member: breadcrumb of a valid three-level hierarchy is root > child > grandchild');                -- 1
SELECT is((SELECT count(*)::int FROM public.document_folders WHERE id = '74000000-0000-4000-8000-00000000d201'), 0,
  'member: the foreign folder is invisible by direct SELECT (Codex reproduction precondition)');      -- 1
SELECT throws_ok(
  $$INSERT INTO public.document_folders (id, workspace_id, folder_name, parent_folder_id, created_by)
    VALUES ('74000000-0000-4000-8000-00000000d104', '74000000-0000-4000-8000-00000000bb01', 'R3 leak probe', '74000000-0000-4000-8000-00000000d201', pg_temp.uid('r3_ws'))$$,
  '23514', 'Parent folder not found in this workspace',
  'member: an owned folder naming a FOREIGN folder as parent is refused (Codex reproduction: was accepted)'); -- 1
SELECT is((SELECT count(*)::int FROM public.document_folders WHERE id = '74000000-0000-4000-8000-00000000d104'), 0,
  'member: nothing was inserted');                                                                    -- 1
SELECT throws_ok(
  $$UPDATE public.document_folders SET parent_folder_id = '74000000-0000-4000-8000-00000000d201' WHERE id = '74000000-0000-4000-8000-00000000d103'$$,
  '23514', NULL, 'member: re-parenting an owned folder under a foreign folder is refused');           -- 1
SELECT throws_ok(
  $$UPDATE public.document_folders SET parent_folder_id = '74000000-0000-4000-8000-00000000d103' WHERE id = '74000000-0000-4000-8000-00000000d101'$$,
  '23514', 'Folder hierarchy would form a cycle',
  'member: re-parenting the root under its own grandchild (a cycle) is refused');                     -- 1
SELECT throws_ok(
  $$UPDATE public.document_folders SET parent_folder_id = '74000000-0000-4000-8000-00000000d101' WHERE id = '74000000-0000-4000-8000-00000000d101'$$,
  '23514', NULL, 'member: a folder cannot be its own parent');                                        -- 1
SELECT lives_ok(
  $$UPDATE public.document_folders SET parent_folder_id = '74000000-0000-4000-8000-00000000d101' WHERE id = '74000000-0000-4000-8000-00000000d103'$$,
  'member: a legitimate same-workspace move (grandchild directly under root) is allowed');            -- 1
SELECT is(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d103')::jsonb,
  '[{"id": "74000000-0000-4000-8000-00000000d101", "name": "R3 root"}, {"id": "74000000-0000-4000-8000-00000000d103", "name": "R3 grandchild"}]'::jsonb,
  'member: the breadcrumb follows the move');                                                         -- 1
SELECT lives_ok(
  $$UPDATE public.document_folders SET folder_name = 'R3 grandchild (renamed)' WHERE id = '74000000-0000-4000-8000-00000000d103'$$,
  'member: a rename does not run the hierarchy guard');                                               -- 1
RESET ROLE;
-- The backend is bound too: a parent in another workspace is refused even when visible.
SELECT throws_ok(
  $$INSERT INTO public.document_folders (id, workspace_id, folder_name, parent_folder_id, created_by)
    VALUES ('74000000-0000-4000-8000-00000000d105', '74000000-0000-4000-8000-00000000bb01', 'R3 backend probe', '74000000-0000-4000-8000-00000000d201', pg_temp.uid('r3_admin'))$$,
  '23514', 'Parent folder must belong to the same workspace',
  'postgres/backend: a cross-workspace parent is refused by the guard itself (not only by RLS)');     -- 1
-- Pre-existing inconsistent rows (written before the guard existed) are simulated
-- with triggers bypassed; they are neither validated nor rewritten by the
-- migration, so the breadcrumb must not disclose the foreign ancestor.
SET LOCAL session_replication_role = replica;
INSERT INTO public.document_folders (id, workspace_id, folder_name, parent_folder_id, created_by) VALUES
  ('74000000-0000-4000-8000-00000000d106', '74000000-0000-4000-8000-00000000bb01', 'R3 legacy child of a foreign parent', '74000000-0000-4000-8000-00000000d201', pg_temp.uid('r3_ws')),
  ('74000000-0000-4000-8000-00000000d107', '74000000-0000-4000-8000-00000000bb01', 'R3 legacy cycle A', NULL, pg_temp.uid('r3_ws')),
  ('74000000-0000-4000-8000-00000000d108', '74000000-0000-4000-8000-00000000bb01', 'R3 legacy cycle B', '74000000-0000-4000-8000-00000000d107', pg_temp.uid('r3_ws'));
UPDATE public.document_folders SET parent_folder_id = '74000000-0000-4000-8000-00000000d108' WHERE id = '74000000-0000-4000-8000-00000000d107';
SET LOCAL session_replication_role = origin;
SELECT tests.authenticate_as('r3_ws');
SELECT is(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d106')::jsonb,
  '[{"id": "74000000-0000-4000-8000-00000000d106", "name": "R3 legacy child of a foreign parent"}]'::jsonb,
  'member: a legacy row whose parent is foreign yields only itself — the foreign id/name is NOT disclosed (Codex reproduction: was returned)'); -- 1
SELECT ok((public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d106')::text) NOT LIKE '%SYNTHETIC FOREIGN FOLDER%'
       AND (public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d106')::text) NOT LIKE '%d201%',
  'member: neither the foreign name nor its id appears anywhere in the answer');                      -- 1
SELECT lives_ok($$SELECT public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d107')$$,
  'member: a legacy cyclic hierarchy terminates (no unbounded recursion)');                           -- 1
SELECT is((SELECT jsonb_array_length(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d107')::jsonb)), 2,
  'member: the cycle A <-> B yields each folder once');                                               -- 1
SELECT throws_ok(
  $$INSERT INTO public.document_folders (id, workspace_id, folder_name, parent_folder_id, created_by)
    VALUES ('74000000-0000-4000-8000-00000000d109', '74000000-0000-4000-8000-00000000bb01', 'R3 under a cycle', '74000000-0000-4000-8000-00000000d107', pg_temp.uid('r3_ws'))$$,
  '23514', 'Folder hierarchy is too deep or cyclic',
  'member: a new folder under a legacy cycle is refused (bounded walk)');                             -- 1
RESET ROLE;
-- Foreign member: cannot read bb01 folders through the breadcrumb.
SELECT tests.authenticate_as('r3_foreign');
SELECT throws_ok($$SELECT public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d103')$$, '42501', 'No access to this workspace',
  'foreign member: breadcrumb of a bb01 folder is refused');                                          -- 1
SELECT is(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d201')::jsonb,
  '[{"id": "74000000-0000-4000-8000-00000000d201", "name": "SYNTHETIC FOREIGN FOLDER"}]'::jsonb,
  'foreign member: breadcrumb of their own folder works');                                            -- 1
RESET ROLE;
-- Backend principal (service_role, no end-user identity): the supported server caller works.
SELECT pg_temp.set_service();
SELECT is(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d103')::jsonb,
  '[{"id": "74000000-0000-4000-8000-00000000d101", "name": "R3 root"}, {"id": "74000000-0000-4000-8000-00000000d103", "name": "R3 grandchild (renamed)"}]'::jsonb,
  'service_role: breadcrumb works for the backend and stays inside the workspace');                  -- 1
SELECT is(public.get_folder_breadcrumb('74000000-0000-4000-8000-00000000d106')::jsonb,
  '[{"id": "74000000-0000-4000-8000-00000000d106", "name": "R3 legacy child of a foreign parent"}]'::jsonb,
  'service_role: even the backend never follows a link out of the workspace');                        -- 1
RESET ROLE;

-- ============================================================================
-- 4. R3-04 — progress survives assignment-source changes
-- ============================================================================
-- (a) group-only -> additional direct assignment (Codex reproduction)
SELECT tests.authenticate_as('r3_group2');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('r3_group2'), '74000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'group2: start as a group-only member');                                                            -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_group2'), 'course_start', '74000000-0000-4000-8000-000000000c02')) ->> 'ok')::boolean, true,
  'group2: sequence advanced to 2');                                                                  -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '20 minutes' WHERE id = pg_temp.open_session('r3_group2');
SELECT tests.authenticate_as('r3_group2');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_group2')), 'group2: end (20 minutes)'); -- 1
RESET ROLE;
SELECT is((SELECT (total_time_spent_minutes, current_course_sequence, started_at IS NOT NULL) FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_group2')),
  (20, 2, true), 'group2: own progress = 20 minutes, sequence 2, started (Codex reproduction step 1)'); -- 1
SELECT tests.authenticate_as('r3_admin');
SELECT lives_ok(
  $$SELECT public.batch_assign_learning_path('74000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('r3_group2')], NULL, pg_temp.uid('r3_admin'))$$,
  'admin: adds a direct assignment for the group member (Codex reproduction step 2)');                -- 1
RESET ROLE;
SELECT is((SELECT (total_time_spent_minutes, current_course_sequence, started_at IS NOT NULL) FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r3_group2') AND path_id = '74000000-0000-4000-8000-00000000000a'),
  (20, 2, true), 'group2: the NEW direct row carries the 20 minutes / sequence 2 / started_at (was 0 / 1 / NULL)'); -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_group2')), 20,
  'group2: own progress still 20 (copied, not summed to 40, not reset)');                             -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_group2')), 1,
  'group2: still exactly one own progress row');                                                      -- 1
-- Subsequent settlement keeps both records in step; a retry credits once.
-- (now() is frozen inside one pgTAP transaction, so a later session must be
-- backdated PAST the first interval [T-20, T] to carry novel minutes: [T-30, T]
-- adds exactly the 10 minutes T-30..T-20 under the union credit.)
SELECT tests.authenticate_as('r3_group2');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('r3_group2'), '74000000-0000-4000-8000-00000000000a')$$, 'group2: new session'); -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '30 minutes' WHERE id = pg_temp.open_session('r3_group2');
SELECT tests.authenticate_as('r3_group2');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_group2')), 'group2: end (10 novel minutes)'); -- 1
SELECT ok(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('r3_group2') ORDER BY session_start DESC LIMIT 1)),
  'group2: a repeated end returns TRUE');                                                             -- 1
RESET ROLE;
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_group2')), 30,
  'group2: own progress 30 (20 + 10, retry credited nothing)');                                       -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r3_group2') AND path_id = '74000000-0000-4000-8000-00000000000a'), 30,
  'group2: the direct mirror is 30 too');                                                             -- 1

-- (b) direct + group -> group-only (the direct row is removed)
SELECT tests.authenticate_as('r3_both');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('r3_both'), '74000000-0000-4000-8000-00000000000a', '74000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'both: start with a direct row AND a group membership');                                            -- 1
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_both'), 'path_complete', NULL)) ->> 'ok')::boolean, true,
  'both: path_complete recorded');                                                                    -- 1
RESET ROLE;
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '15 minutes' WHERE id = pg_temp.open_session('r3_both');
SELECT tests.authenticate_as('r3_both');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_both')), 'both: end (15 minutes)'); -- 1
RESET ROLE;
SELECT is((SELECT (a.total_time_spent_minutes, a.completed_at IS NOT NULL) FROM public.learning_path_assignments a WHERE a.id = '74000000-0000-4000-8000-0000000000a3'),
  (15, true), 'both: the direct row shows 15 minutes and the completion');                             -- 1
DELETE FROM public.learning_path_assignments WHERE id = '74000000-0000-4000-8000-0000000000a3';
SELECT is((SELECT (total_time_spent_minutes, completed_at IS NOT NULL) FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_both')),
  (15, true), 'both: after the direct row is removed the own progress keeps 15 minutes and the completion'); -- 1
SELECT tests.authenticate_as('r3_both');
SELECT ok(public.auth_is_learning_path_assignee('74000000-0000-4000-8000-00000000000a'),
  'both: still an assignee through the group');                                                       -- 1
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('r3_both'), '74000000-0000-4000-8000-00000000000a')$$,
  'both: a new session starts as a group-only member');                                               -- 1
RESET ROLE;
-- [T-20, T] overlaps the settled [T-15, T]: 5 novel minutes (frozen now(), see above)
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '20 minutes' WHERE id = pg_temp.open_session('r3_both');
SELECT tests.authenticate_as('r3_both');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_both')), 'both: end (5 novel minutes)'); -- 1
RESET ROLE;
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_both')), 20,
  'both: own progress 20 (15 + 5) — history continued, not restarted');                               -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE user_id = pg_temp.uid('r3_both')), 0,
  'both: still no direct row (progress did not recreate an assignment)');                             -- 1
-- and the membership itself ending removes access without touching the credit
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('r3_both');
SELECT tests.authenticate_as('r3_both');
SELECT ok(NOT public.auth_is_learning_path_assignee('74000000-0000-4000-8000-00000000000a'), 'both: after the membership ends, no authority'); -- 1
SELECT is((SELECT count(*)::int FROM public.learning_paths), 0, 'both: the template is invisible');   -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_both')), 20,
  'both: the 20 credited minutes remain readable to them (retention grants nothing)');                -- 1
RESET ROLE;

-- (c) existing direct history BEFORE any progress row (the migration backfill
--     runs once; the same copy semantics apply to rows that appear later)
-- (c1) a direct row inserted with history through the normal path gets its
--      progress row from the ensure trigger, copied
INSERT INTO public.learning_path_assignments (id, path_id, user_id, assigned_by, total_time_spent_minutes, started_at, completed_at, current_course_sequence)
VALUES ('74000000-0000-4000-8000-0000000000a7', '74000000-0000-4000-8000-00000000000a', pg_temp.uid('r3_history'), pg_temp.uid('r3_admin'),
        120, now() - interval '30 days', now() - interval '2 days', 2);
SELECT is((SELECT (total_time_spent_minutes, current_course_sequence, completed_at IS NOT NULL, started_at IS NOT NULL) FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_history')),
  (120, 2, true, true), 'history: the progress row is initialised FROM the direct history (120 / 2 / completed / started), not zero (Codex probe)'); -- 1
-- (c2) a direct row that has NO progress row at all (as if written before this
--      release, triggers bypassed): the first settlement seeds the copy first
DELETE FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_history');
SELECT is((SELECT count(*)::int FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_history')), 0,
  'history: precondition — no progress row');                                                         -- 1
SELECT tests.authenticate_as('r3_history');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('r3_history'), '74000000-0000-4000-8000-00000000000a')$$, 'history: start'); -- 1
RESET ROLE;
SELECT is((SELECT (total_time_spent_minutes, current_course_sequence, completed_at IS NOT NULL, started_at < now() - interval '29 days') FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_history')),
  (120, 2, true, true), 'history: the first write seeds the progress row from the 120-minute history (started_at kept, not now())'); -- 1
UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '7 minutes' WHERE id = pg_temp.open_session('r3_history');
SELECT tests.authenticate_as('r3_history');
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_history')), 'history: end (7 minutes)'); -- 1
RESET ROLE;
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('r3_history')), 127,
  'history: own progress 127 = 120 (history) + 7');                                                   -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '74000000-0000-4000-8000-0000000000a7'), 127,
  'history: the direct row is 127 too (same increment, no double count)');                            -- 1
-- (c3) the migration backfill invariant, re-stated as a query every direct row
--      of this fixture set satisfies: its pair's progress row matches its values
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments a
            LEFT JOIN public.learning_path_user_progress up ON up.user_id = a.user_id AND up.path_id = a.path_id
           WHERE a.user_id IS NOT NULL AND a.path_id = '74000000-0000-4000-8000-00000000000a'
             AND (up.user_id IS NULL
                  OR up.total_time_spent_minutes <> coalesce(a.total_time_spent_minutes, 0)
                  OR up.completed_at IS DISTINCT FROM a.completed_at
                  OR up.started_at IS DISTINCT FROM a.started_at)), 0,
  'invariant: every direct assignment row of the fixture path has a progress row with identical total / started / completed'); -- 1

-- ============================================================================
-- 5. R3-02 — lock protocol facts observable in one session
-- ============================================================================
-- Fresh open session for the valid assignee.
SELECT tests.authenticate_as('r3_valid');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('r3_valid'), '74000000-0000-4000-8000-00000000000a')$$, 'lock: start'); -- 1
SELECT ok(pg_temp.holds_pair_lock(pg_temp.uid('r3_valid'), '74000000-0000-4000-8000-00000000000a'),
  'lock: start holds the per-(user, path) advisory lock for the rest of the transaction');            -- 1
RESET ROLE;
-- A savepoint-scoped probe: activity on the session takes (re-enters) the same
-- advisory lock; end does too; the maintenance close takes the pair locks of
-- its candidates. (Advisory xact locks are held to COMMIT, so their presence
-- after each call is the observable protocol fact; the ORDER — advisory before
-- row — is proved with real concurrent connections in
-- scripts/ci/lp-session-settlement-proof.mjs.)
SELECT tests.authenticate_as('r3_valid');
SELECT is((SELECT (public.record_learning_path_activity(pg_temp.open_session('r3_valid'), 'path_view', NULL)) ->> 'ok')::boolean, true, 'lock: activity'); -- 1
SELECT ok(pg_temp.holds_pair_lock(pg_temp.uid('r3_valid'), '74000000-0000-4000-8000-00000000000a'), 'lock: activity holds the pair advisory lock'); -- 1
SELECT ok(public.end_learning_path_session(pg_temp.open_session('r3_valid')), 'lock: end');           -- 1
RESET ROLE;
-- a stale open session for the admin fixture user, closed by the maintenance path
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
VALUES ('74000000-0000-4000-8000-0000000000e9', pg_temp.uid('r3_admin'), '74000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '50 minutes', now() - interval '20 minutes');
SELECT pg_temp.set_service();
SELECT is((SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes')), '{"closed": 1, "settled": 1}'::jsonb,
  'lock: the maintenance close settles the one stale session');                                       -- 1
SELECT ok(pg_temp.holds_pair_lock(pg_temp.uid('r3_admin'), '74000000-0000-4000-8000-00000000000a'),
  'lock: the maintenance close holds the pair advisory lock of its candidate');                       -- 1
RESET ROLE;
SELECT is((SELECT credited_minutes FROM public.learning_path_progress_sessions WHERE id = '74000000-0000-4000-8000-0000000000e9'), 30,
  'lock: and credited it once (30)');                                                                 -- 1

SELECT * FROM finish();

ROLLBACK;
