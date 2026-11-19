-- =============================================================================
-- 144-feedback-reporter-writes.sql — GENERA fixes F15e, build 4:
-- migration 20261118106000_feedback_reporter_writes.sql.
--
-- What the person who reported a problem may WRITE on Soporte.
--
--   A. On public.feedback_activity only an admin, or the system's own trigger,
--      writes a SYSTEM line (is_system_message true); everybody else's rows are
--      ordinary comments.
--   B. On public.platform_feedback a reporter creates their ticket and reads it;
--      changing or deleting a ticket is for admins.
--
--   0. catalog: how the state-change line is written (who runs the insert,
--      does it pass row level security), the rules this build adds, and the
--      exact rule list of both tables after this build
--   1. item A: system lines and ordinary comments per role; the trigger's line
--   2. item B: role x operation on platform_feedback (admin, reporter, another
--      signed-in person, visitor x read, add, change, delete)
--
-- People: R reports tickets T and X; P reports ticket U; A is an admin.
-- Every write is made with the writer's own session. Invented people and data
-- only. Blocked INSERT throws 42501; blocked SELECT / UPDATE / DELETE touch 0
-- rows.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(62);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.ticket(k text) RETURNS text AS $$
  SELECT CASE k WHEN 'T' THEN '14400000-0000-4000-8000-0000000000f1'
                WHEN 'U' THEN '14400000-0000-4000-8000-0000000000f2'
                WHEN 'X' THEN '14400000-0000-4000-8000-0000000000f3'
                WHEN 'Y' THEN '14400000-0000-4000-8000-0000000000f4'
                WHEN 'Z' THEN '14400000-0000-4000-8000-0000000000f5' END;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.become(p text) RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
  IF p = 'anon' THEN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  ELSE
    PERFORM tests.authenticate_as('f15e144_' || p);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run one data statement as person p: 'rows:<n>' or the SQLSTATE of the refusal.
CREATE OR REPLACE FUNCTION pg_temp.act(p text, stmt text) RETURNS text AS $$
DECLARE r text; n int;
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := 'rows:' || n;
  EXCEPTION WHEN others THEN
    r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM tests.clear_authentication();
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- One answer of a question (or a statement with RETURNING) asked as person p, or the SQLSTATE.
CREATE OR REPLACE FUNCTION pg_temp.ask(p text, q text) RETURNS text AS $$
DECLARE r text;
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE q INTO r;
  EXCEPTION WHEN others THEN
    r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM tests.clear_authentication();
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- An activity row on ticket k written by `author`, system line or not.
CREATE OR REPLACE FUNCTION pg_temp.line(id text, k text, author text, msg text, sys boolean) RETURNS text AS $$
  SELECT format('INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message) VALUES (%L, %L, %L, %L, %L)',
                id, pg_temp.ticket(k), msg, pg_temp.uid(author), sys);
$$ LANGUAGE sql;

-- Rows on ticket k, counted as postgres (no rules). The reporter's forged system line
-- (id ...a1, refused) is left out of the count, so a regression shows in the two forged-line tests
-- and not as a knock-on count elsewhere.
CREATE OR REPLACE FUNCTION pg_temp.rows_on(k text) RETURNS int AS $$
  SELECT count(*)::int FROM public.feedback_activity
   WHERE feedback_id = pg_temp.ticket(k)::uuid AND id <> '14400000-0000-4000-8000-0000000000a1';
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
--   r      docente, reports tickets T and X
--   p      docente, reports ticket U
--   admin  admin
INSERT INTO ids SELECT p, tests.create_supabase_user('f15e144_' || p, 'f15e144-' || p || '@example.test')
FROM unnest(ARRAY['r','p','admin']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, is_active) VALUES
  (pg_temp.uid('r'),     'docente', true),
  (pg_temp.uid('p'),     'docente', true),
  (pg_temp.uid('admin'), 'admin',   true);
INSERT INTO public.platform_feedback (id, description, type, status, created_by) VALUES
  (pg_temp.ticket('T')::uuid, 'F15e-144 ticket sintético T', 'bug',  'new', pg_temp.uid('r')),
  (pg_temp.ticket('U')::uuid, 'F15e-144 ticket sintético U', 'idea', 'new', pg_temp.uid('p')),
  (pg_temp.ticket('X')::uuid, 'F15e-144 ticket sintético X', 'bug',  'new', pg_temp.uid('r'));

-- ---------------------------------------------------------------------------
-- (0) Catalog: how the state-change line is written
-- ---------------------------------------------------------------------------
-- The trigger function runs with the caller's rights; it calls add_feedback_activity,
-- which runs with its owner's rights. If that owner bypasses row level security and
-- the table does not FORCE it, the trigger's own insert does not pass the rules.
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.feedback_status_change_trigger()'::regprocedure), false,
  'catalog: feedback_status_change_trigger runs with the caller''s rights (SECURITY INVOKER)');
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.add_feedback_activity(uuid, text, uuid, boolean)'::regprocedure), true,
  'catalog: add_feedback_activity runs with its owner''s rights (SECURITY DEFINER)');
SELECT is((SELECT pg_get_userbyid(proowner)::text FROM pg_proc WHERE oid = 'public.add_feedback_activity(uuid, text, uuid, boolean)'::regprocedure), 'postgres',
  'catalog: add_feedback_activity is owned by postgres');
SELECT is((SELECT pg_get_userbyid(relowner)::text FROM pg_class WHERE oid = 'public.feedback_activity'::regclass), 'postgres',
  'catalog: feedback_activity is owned by postgres');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.feedback_activity'::regclass), false,
  'catalog: feedback_activity is not under FORCE ROW LEVEL SECURITY (its owner is not held to the rules)');
SELECT ok((SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = 'postgres'),
  'catalog: postgres bypasses row level security');
SELECT is((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.platform_feedback'::regclass), false,
  'catalog: platform_feedback is not under FORCE ROW LEVEL SECURITY');
SELECT tests.rls_enabled('public', 'platform_feedback');
SELECT tests.rls_enabled('public', 'feedback_activity');

-- The rules this build adds (restrictive, signed-in people only).
SELECT is((SELECT permissive || '/' || cmd || '/' || roles::text FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'platform_feedback' AND policyname = 'platform_feedback_change_by_admins'),
  'RESTRICTIVE/UPDATE/{authenticated}', 'catalog: platform_feedback_change_by_admins is a restrictive UPDATE rule for signed-in people');
SELECT is((SELECT permissive || '/' || cmd || '/' || roles::text FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'platform_feedback' AND policyname = 'platform_feedback_delete_by_admins'),
  'RESTRICTIVE/DELETE/{authenticated}', 'catalog: platform_feedback_delete_by_admins is a restrictive DELETE rule for signed-in people');
SELECT is((SELECT permissive || '/' || cmd || '/' || roles::text || '/' || coalesce(with_check, '') FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'feedback_activity' AND policyname = 'feedback_activity_system_lines_by_admins'),
  'RESTRICTIVE/INSERT/{authenticated}/((is_system_message IS NOT TRUE) OR auth_is_admin())',
  'catalog: feedback_activity_system_lines_by_admins is a restrictive INSERT rule for signed-in people');
-- Every rule of the two tables after this build, so the next change to them is seen.
SELECT policies_are('public', 'platform_feedback', ARRAY[
  'forced_password_change_guard',
  'platform_feedback_admin_all',
  'platform_feedback_change_by_admins',
  'platform_feedback_delete_by_admins',
  'platform_feedback_user_own'],
  'catalog: platform_feedback has exactly its five rules');
SELECT policies_are('public', 'feedback_activity', ARRAY[
  'Users can add comments to their feedback',
  'Users can view activity for their feedback',
  'feedback_activity_admin_all',
  'feedback_activity_system_lines_by_admins',
  'feedback_activity_user_view_own',
  'forced_password_change_guard'],
  'catalog: feedback_activity has exactly its six rules');
-- The two rules that were already there are unchanged.
SELECT is((SELECT permissive || '/' || cmd || '/' || coalesce(qual, '') || '/' || coalesce(with_check, '') FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'platform_feedback' AND policyname = 'platform_feedback_user_own'),
  'PERMISSIVE/ALL/(created_by = auth.uid())/(created_by = auth.uid())', 'catalog: platform_feedback_user_own is unchanged');
SELECT is((SELECT permissive || '/' || cmd || '/' || coalesce(qual, '') || '/' || coalesce(with_check, '') FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'platform_feedback' AND policyname = 'platform_feedback_admin_all'),
  'PERMISSIVE/ALL/auth_is_admin()/auth_is_admin()', 'catalog: platform_feedback_admin_all is unchanged');

-- ---------------------------------------------------------------------------
-- (1) Item A: system lines
-- ---------------------------------------------------------------------------
-- The failing line before this build: R writes a SYSTEM line on their own ticket.
SELECT is(pg_temp.act('r', pg_temp.line('14400000-0000-4000-8000-0000000000a1', 'T', 'r', 'Estado cambiado de new a resolved', true)), '42501',
  'reporter: cannot add a system line on their own ticket');
SELECT is((SELECT count(*)::int FROM public.feedback_activity WHERE id = '14400000-0000-4000-8000-0000000000a1'), 0,
  'the refused system line left no row');
SELECT is(pg_temp.ask('r', format(
  $q$INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message)
     VALUES ('14400000-0000-4000-8000-0000000000a2', %L, 'Comentario de R', %L, false) RETURNING message || '/' || is_system_message::text$q$,
  pg_temp.ticket('T'), pg_temp.uid('r'))), 'Comentario de R/false',
  'reporter: INSERT ... RETURNING of an ordinary comment on their ticket reads it back');
SELECT is(pg_temp.ask('r', format(
  $q$INSERT INTO public.feedback_activity (id, feedback_id, message, created_by)
     VALUES ('14400000-0000-4000-8000-0000000000a3', %L, 'Comentario de R sin la columna', %L) RETURNING is_system_message::text$q$,
  pg_temp.ticket('T'), pg_temp.uid('r'))), 'false',
  'reporter: a comment written without the column is an ordinary comment');
SELECT is(pg_temp.ask('admin', format(
  $q$INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message)
     VALUES ('14400000-0000-4000-8000-0000000000a4', %L, 'Línea de sistema de A', %L, true) RETURNING message || '/' || is_system_message::text$q$,
  pg_temp.ticket('T'), pg_temp.uid('admin'))), 'Línea de sistema de A/true',
  'admin: INSERT ... RETURNING of a system line on T reads it back');
SELECT is(pg_temp.ask('admin', format(
  $q$INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message)
     VALUES ('14400000-0000-4000-8000-0000000000a5', %L, 'Nota de A', %L, false) RETURNING message || '/' || is_system_message::text$q$,
  pg_temp.ticket('T'), pg_temp.uid('admin'))), 'Nota de A/false',
  'admin: INSERT ... RETURNING of an ordinary row on T reads it back');
SELECT is(pg_temp.act('r', pg_temp.line('14400000-0000-4000-8000-0000000000a6', 'T', 'admin', 'R firma como A', true)), '42501',
  'reporter: cannot add a system line on T in the admin''s name');
SELECT is(pg_temp.act('p', pg_temp.line('14400000-0000-4000-8000-0000000000a7', 'T', 'p', 'P en T', false)), '42501',
  'another person: cannot add an ordinary row on T');
SELECT is(pg_temp.act('p', pg_temp.line('14400000-0000-4000-8000-0000000000a8', 'T', 'p', 'P sistema en T', true)), '42501',
  'another person: cannot add a system line on T');
SELECT is(pg_temp.act('anon', pg_temp.line('14400000-0000-4000-8000-0000000000a9', 'T', 'r', 'visitante', false)), '42501',
  'visitor: cannot add an ordinary row on T');
SELECT is(pg_temp.act('anon', pg_temp.line('14400000-0000-4000-8000-0000000000aa', 'T', 'r', 'visitante sistema', true)), '42501',
  'visitor: cannot add a system line on T');
SELECT is(pg_temp.rows_on('T'), 4,
  'T holds exactly the four accepted rows (two of R, two of A)');

-- The trigger's line: A changes T's state with A's own session.
SELECT is(pg_temp.ask('admin', format(
  $q$UPDATE public.platform_feedback SET status = 'in_progress' WHERE id = %L RETURNING status$q$, pg_temp.ticket('T'))), 'in_progress',
  'admin: UPDATE ... RETURNING changes the state of T');
SELECT is(pg_temp.rows_on('T'), 5,
  'the state change wrote exactly one new row on T');
SELECT is((SELECT count(*)::int FROM public.feedback_activity
            WHERE feedback_id = pg_temp.ticket('T')::uuid AND is_system_message AND message = 'Estado cambiado de new a in_progress'), 1,
  'that row is the system line of the state change');
SELECT is((SELECT created_by FROM public.feedback_activity
            WHERE feedback_id = pg_temp.ticket('T')::uuid AND message = 'Estado cambiado de new a in_progress'), pg_temp.uid('r'),
  'the system line is written in the reporter''s name (unchanged trigger)');

-- ---------------------------------------------------------------------------
-- (2) Item B: role x operation on platform_feedback
-- ---------------------------------------------------------------------------
-- read
SELECT is(pg_temp.ask('r', $q$SELECT string_agg(description, ',' ORDER BY description) FROM public.platform_feedback WHERE description LIKE 'F15e-144%'$q$),
  'F15e-144 ticket sintético T,F15e-144 ticket sintético X', 'reporter: reads their two tickets, not P''s');
SELECT is(pg_temp.ask('p', $q$SELECT string_agg(description, ',' ORDER BY description) FROM public.platform_feedback WHERE description LIKE 'F15e-144%'$q$),
  'F15e-144 ticket sintético U', 'another person: reads only their own ticket');
SELECT is(pg_temp.ask('anon', $q$SELECT count(*)::text FROM public.platform_feedback WHERE description LIKE 'F15e-144%'$q$),
  '0', 'visitor: reads no ticket');
SELECT is(pg_temp.ask('admin', $q$SELECT count(*)::text FROM public.platform_feedback WHERE description LIKE 'F15e-144%'$q$),
  '3', 'admin: reads every ticket');

-- add
SELECT is(pg_temp.ask('r', format(
  $q$INSERT INTO public.platform_feedback (id, description, type, created_by) VALUES (%L, 'F15e-144 ticket nuevo de R', 'bug', %L) RETURNING description || '/' || status$q$,
  pg_temp.ticket('Y'), pg_temp.uid('r'))), 'F15e-144 ticket nuevo de R/new',
  'reporter: INSERT ... RETURNING of a new ticket of their own reads it back (as the feedback window does)');
SELECT is(pg_temp.act('r', format(
  $q$INSERT INTO public.platform_feedback (description, type, created_by) VALUES ('R en nombre de P', 'bug', %L)$q$, pg_temp.uid('p'))), '42501',
  'reporter: cannot add a ticket in another person''s name');
SELECT is(pg_temp.act('anon', format(
  $q$INSERT INTO public.platform_feedback (description, type, created_by) VALUES ('visitante', 'bug', %L)$q$, pg_temp.uid('r'))), '42501',
  'visitor: cannot add a ticket');
SELECT is(pg_temp.ask('admin', format(
  $q$INSERT INTO public.platform_feedback (id, description, type, created_by) VALUES (%L, 'F15e-144 ticket de A', 'idea', %L) RETURNING description$q$,
  pg_temp.ticket('Z'), pg_temp.uid('admin'))), 'F15e-144 ticket de A',
  'admin: INSERT ... RETURNING of a ticket reads it back');
SELECT is(pg_temp.ask('r', $q$SELECT count(*)::text FROM public.platform_feedback WHERE created_by = auth.uid()$q$),
  '3', 'reporter: still reads all their tickets, the new one included');

-- change: the failing lines before the migration
SELECT is(pg_temp.act('r', format('UPDATE public.platform_feedback SET status = ''resolved'' WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'reporter: cannot change the state of their own ticket');
SELECT is((SELECT count(*)::int FROM public.feedback_activity
            WHERE feedback_id = pg_temp.ticket('T')::uuid AND message = 'Estado cambiado de in_progress a resolved'), 0,
  'the refused change of state wrote no system line');
SELECT is(pg_temp.act('r', format('UPDATE public.platform_feedback SET resolution_notes = ''Resuelto por R'' WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'reporter: cannot change the resolution notes of their own ticket');
SELECT is(pg_temp.act('r', format('UPDATE public.platform_feedback SET description = ''Cambiado por R'' WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'reporter: cannot change the description of their own ticket');
SELECT is((SELECT status || '/' || coalesce(resolution_notes, '-') || '/' || description FROM public.platform_feedback WHERE id = pg_temp.ticket('T')::uuid),
  'in_progress/-/F15e-144 ticket sintético T', 'T is unchanged after the reporter''s refused changes');
SELECT is(pg_temp.act('r', format('UPDATE public.platform_feedback SET status = ''closed'' WHERE id = %L', pg_temp.ticket('Y'))), 'rows:0',
  'reporter: cannot change the ticket they just created either');
SELECT is(pg_temp.act('p', format('UPDATE public.platform_feedback SET status = ''resolved'' WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'another person: cannot change T');
SELECT is(pg_temp.act('anon', format('UPDATE public.platform_feedback SET status = ''resolved'' WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'visitor: cannot change T');
SELECT is(pg_temp.rows_on('T'), 5,
  'no refused change wrote a row on T');
-- The admin's inbox marks a ticket «Visto» and changes its state with the admin's own session.
SELECT is(pg_temp.ask('admin', format(
  $q$UPDATE public.platform_feedback SET status = 'seen' WHERE id = %L RETURNING status$q$, pg_temp.ticket('U'))), 'seen',
  'admin: UPDATE ... RETURNING marks P''s ticket «Visto»');
SELECT is(pg_temp.ask('admin', format(
  $q$UPDATE public.platform_feedback SET status = 'resolved', resolved_at = now(), resolution_notes = 'Resuelto por A' WHERE id = %L RETURNING status || '/' || resolution_notes$q$,
  pg_temp.ticket('T'))), 'resolved/Resuelto por A',
  'admin: UPDATE ... RETURNING resolves T with notes');
SELECT is(pg_temp.rows_on('T'), 6,
  'the admin''s change of state of T wrote its one system line');

-- delete
SELECT is(pg_temp.act('r', format('DELETE FROM public.platform_feedback WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'reporter: cannot delete their own ticket');
SELECT is(pg_temp.act('r', format('DELETE FROM public.platform_feedback WHERE id = %L', pg_temp.ticket('Y'))), 'rows:0',
  'reporter: cannot delete the ticket they just created');
SELECT is(pg_temp.act('p', format('DELETE FROM public.platform_feedback WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'another person: cannot delete T');
SELECT is(pg_temp.act('anon', format('DELETE FROM public.platform_feedback WHERE id = %L', pg_temp.ticket('T'))), 'rows:0',
  'visitor: cannot delete T');
SELECT is((SELECT count(*)::int FROM public.platform_feedback WHERE id IN (pg_temp.ticket('T')::uuid, pg_temp.ticket('Y')::uuid)), 2,
  'T and Y are still there after the refused deletes');
SELECT is(pg_temp.rows_on('T'), 6,
  'T keeps its six rows');
SELECT is(pg_temp.ask('admin', format(
  $q$DELETE FROM public.platform_feedback WHERE id = %L RETURNING description$q$, pg_temp.ticket('X'))), 'F15e-144 ticket sintético X',
  'admin: DELETE ... RETURNING removes the reporter''s ticket X');
SELECT is((SELECT count(*)::int FROM public.platform_feedback WHERE id = pg_temp.ticket('X')::uuid), 0,
  'X is gone');
SELECT is(pg_temp.act('admin', format('DELETE FROM public.platform_feedback WHERE id = %L', pg_temp.ticket('Z'))), 'rows:1',
  'admin: deletes their own ticket Z');

SELECT * FROM finish();
ROLLBACK;
