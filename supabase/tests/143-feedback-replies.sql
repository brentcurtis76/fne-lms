-- =============================================================================
-- 143-feedback-replies.sql — GENERA fixes F15e, build 1 (GES-2.18, item E1-rules):
-- migration 20261118105000_feedback_replies.sql.
--
-- What an admin writes on a Soporte ticket is either a reply (the person who
-- reported sees it) or an internal note (only admins see it). The new column
-- feedback_activity.visible_to_reporter (boolean, not null, default false)
-- marks a reply; the reporter's ticket-wide read rule now reads only marked
-- rows. The reporter keeps reading what they wrote themselves (the rule
-- "feedback_activity_user_view_own", unchanged).
--
--   1. catalog: the column, its type, NOT NULL, default false, its comment;
--      the table keeps exactly its four rules; the reporter's read rule names
--      the new column
--   2. reads: reporter R, another person P, admin A, a visitor (anon)
--   3. adds, changes and deletes per role (role x operation)
--   4. the state-change trigger still writes its line, not marked
--
-- People: R reports ticket T; P reports ticket U; A is an admin. A writes on
-- T with A's own session (as the admin's screen does). Invented people and
-- data only. Blocked INSERT throws 42501; blocked SELECT / UPDATE / DELETE
-- touch 0 rows.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(55);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;

-- Names of the fixed rows, readable by everyone inside the test.
CREATE TEMP TABLE lbl (id uuid PRIMARY KEY, n text) ON COMMIT DROP;
GRANT SELECT ON lbl TO anon, authenticated;
INSERT INTO lbl VALUES
  ('14300000-0000-4000-8000-0000000000a1', 'T_R'),        -- R's own comment on T
  ('14300000-0000-4000-8000-0000000000a2', 'T_A_note'),   -- A's comment on T, not marked
  ('14300000-0000-4000-8000-0000000000a3', 'T_A_reply'),  -- A's comment on T, marked for the reporter
  ('14300000-0000-4000-8000-0000000000a4', 'T_R_true'),   -- R's own comment on T, R set the column true
  ('14300000-0000-4000-8000-0000000000a5', 'T_R_false'),  -- R's own comment on T, R set the column false
  ('14300000-0000-4000-8000-0000000000b1', 'U_P'),        -- P's own comment on U
  ('14300000-0000-4000-8000-0000000000b2', 'U_A_note'),   -- A's comment on U, not marked
  ('14300000-0000-4000-8000-0000000000c1', 'T_A_spare'),  -- A's row on T used for change / delete
  ('14300000-0000-4000-8000-0000000000e1', 'T_R_ret'),    -- R's comment on T written with RETURNING
  ('14300000-0000-4000-8000-0000000000e2', 'U_A_ret');    -- A's reply on U written with RETURNING
CREATE OR REPLACE FUNCTION pg_temp.r(name text) RETURNS text AS $$
  SELECT id::text FROM lbl WHERE n = name;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.ticket(k text) RETURNS text AS $$
  SELECT CASE k WHEN 'T' THEN '14300000-0000-4000-8000-0000000000f1'
                WHEN 'U' THEN '14300000-0000-4000-8000-0000000000f2' END;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.become(p text) RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
  IF p = 'anon' THEN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  ELSE
    PERFORM tests.authenticate_as('f15e143_' || p);
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

-- One answer of a question asked as person p (or the SQLSTATE).
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

-- The named rows of ticket k that person p reads (system lines as 'sys'), sorted.
CREATE OR REPLACE FUNCTION pg_temp.seen(p text, k text) RETURNS text AS $$
  SELECT pg_temp.ask(p, format(
    $q$SELECT coalesce(string_agg(coalesce(l.n, CASE WHEN f.is_system_message THEN 'sys' ELSE '?' END), ','
                ORDER BY coalesce(l.n, CASE WHEN f.is_system_message THEN 'sys' ELSE '?' END) COLLATE "C"), '')
         FROM public.feedback_activity f LEFT JOIN lbl l ON l.id = f.id
        WHERE f.feedback_id = %L$q$, pg_temp.ticket(k)));
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.ins(id text, k text, author text, msg text, extra text) RETURNS text AS $$
  SELECT format('INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message%s) VALUES (%L, %L, %L, %L, false%s)',
                CASE WHEN extra IS NULL THEN '' ELSE ', visible_to_reporter' END,
                id, pg_temp.ticket(k), msg, pg_temp.uid(author),
                CASE WHEN extra IS NULL THEN '' ELSE ', ' || extra END);
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
--   r      docente, reports ticket T
--   p      docente, reports ticket U
--   admin  admin
INSERT INTO ids SELECT p, tests.create_supabase_user('f15e143_' || p, 'f15e143-' || p || '@example.test')
FROM unnest(ARRAY['r','p','admin']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, is_active) VALUES
  (pg_temp.uid('r'),     'docente', true),
  (pg_temp.uid('p'),     'docente', true),
  (pg_temp.uid('admin'), 'admin',   true);
INSERT INTO public.platform_feedback (id, description, type, status, created_by) VALUES
  (pg_temp.ticket('T')::uuid, 'F15e-143 ticket sintético T', 'bug', 'new', pg_temp.uid('r')),
  (pg_temp.ticket('U')::uuid, 'F15e-143 ticket sintético U', 'idea', 'new', pg_temp.uid('p'));

-- ---------------------------------------------------------------------------
-- (1) Catalog
-- ---------------------------------------------------------------------------
SELECT has_column('public', 'feedback_activity', 'visible_to_reporter', 'feedback_activity has visible_to_reporter');
SELECT col_type_is('public', 'feedback_activity', 'visible_to_reporter', 'boolean', 'it is boolean');
SELECT col_not_null('public', 'feedback_activity', 'visible_to_reporter', 'it is NOT NULL');
SELECT col_default_is('public', 'feedback_activity', 'visible_to_reporter', 'false', 'its default is false');
SELECT ok(
  coalesce(length(col_description('public.feedback_activity'::regclass,
    (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.feedback_activity'::regclass AND attname = 'visible_to_reporter'))), 0) > 0,
  'the column carries a comment');
SELECT policies_are('public', 'feedback_activity', ARRAY[
  'Users can add comments to their feedback',
  'Users can view activity for their feedback',
  'feedback_activity_admin_all',
  'feedback_activity_user_view_own',
  'forced_password_change_guard'],
  'feedback_activity keeps exactly its four rules and the restrictive forced-password-change guard');
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feedback_activity'
     AND policyname = 'Users can view activity for their feedback') ~ 'visible_to_reporter',
  'the reporter''s ticket-wide read rule names visible_to_reporter');
SELECT tests.rls_enabled('public', 'feedback_activity');

-- ---------------------------------------------------------------------------
-- Writes that build the case, each with the writer's own session
-- ---------------------------------------------------------------------------
-- R's own comment on T (R gives no value for the new column)
SELECT is(pg_temp.act('r', pg_temp.ins(pg_temp.r('T_R'), 'T', 'r', 'Comentario de R', NULL)), 'rows:1',
  'reporter: adds their own comment on their ticket');
-- A writes a comment on T, as the admin's screen does (no value for the column)
SELECT is(pg_temp.act('admin', pg_temp.ins(pg_temp.r('T_A_note'), 'T', 'admin', 'Nota interna de A', NULL)), 'rows:1',
  'admin: adds a comment on T with the admin''s own session');
-- A writes a comment on T marked for the reporter
SELECT is(pg_temp.act('admin', pg_temp.ins(pg_temp.r('T_A_reply'), 'T', 'admin', 'Respuesta de A para R', 'true')), 'rows:1',
  'admin: adds a comment on T marked for the reporter');
SELECT is(pg_temp.act('admin', pg_temp.ins(pg_temp.r('T_A_spare'), 'T', 'admin', 'Fila de repuesto', NULL)), 'rows:1',
  'admin: adds a spare row on T');
SELECT is(pg_temp.act('p', pg_temp.ins(pg_temp.r('U_P'), 'U', 'p', 'Comentario de P', NULL)), 'rows:1',
  'another person: adds their own comment on their own ticket U');
SELECT is(pg_temp.act('admin', pg_temp.ins(pg_temp.r('U_A_note'), 'U', 'admin', 'Nota interna de A en U', NULL)), 'rows:1',
  'admin: adds a comment on U');
-- R sets the new column on R's OWN rows, both ways
SELECT is(pg_temp.act('r', pg_temp.ins(pg_temp.r('T_R_true'), 'T', 'r', 'R marca true', 'true')), 'rows:1',
  'reporter: adds their own comment with visible_to_reporter true');
SELECT is(pg_temp.act('r', pg_temp.ins(pg_temp.r('T_R_false'), 'T', 'r', 'R marca false', 'false')), 'rows:1',
  'reporter: adds their own comment with visible_to_reporter false');

SELECT is(pg_temp.ask('admin', format($q$SELECT visible_to_reporter::text FROM public.feedback_activity WHERE id = %L$q$, pg_temp.r('T_A_note'))), 'false',
  'A''s comment written without the column is not marked for the reporter (default false)');

-- ---------------------------------------------------------------------------
-- (2) Reads
-- ---------------------------------------------------------------------------
-- The failing line before the migration: R reads A's unmarked comments on T.
SELECT is(pg_temp.ask('r', format(
  $q$SELECT count(*)::text FROM public.feedback_activity WHERE feedback_id = %L AND created_by = %L AND id <> %L$q$,
  pg_temp.ticket('T'), pg_temp.uid('admin'), pg_temp.r('T_A_reply'))), '0',
  'reporter: reads no row written by the admin on their ticket that is not marked for them');
SELECT is(pg_temp.ask('r', format(
  $q$SELECT message FROM public.feedback_activity WHERE id = %L$q$, pg_temp.r('T_A_reply'))), 'Respuesta de A para R',
  'reporter: reads the admin''s row marked for them, with its message');
SELECT is(pg_temp.ask('r', format(
  $q$SELECT count(*)::text FROM public.feedback_activity WHERE feedback_id = %L AND created_by = %L$q$,
  pg_temp.ticket('T'), pg_temp.uid('r'))), '3',
  'reporter: reads the three rows they wrote on T');
SELECT is(pg_temp.seen('r', 'T'), 'T_A_reply,T_R,T_R_false,T_R_true',
  'reporter: on T reads exactly their own rows and the admin''s marked row, whatever they set on their own rows');
SELECT is(pg_temp.seen('r', 'U'), '', 'reporter: reads nothing of another person''s ticket U');
SELECT is(pg_temp.seen('p', 'T'), '', 'another person: reads nothing of T');
SELECT is(pg_temp.seen('p', 'U'), 'U_P', 'another person: on U reads their own row, not the admin''s note');
SELECT is(pg_temp.seen('admin', 'T'), 'T_A_note,T_A_reply,T_A_spare,T_R,T_R_false,T_R_true',
  'admin: reads everything of T');
SELECT is(pg_temp.seen('admin', 'U'), 'U_A_note,U_P', 'admin: reads everything of U');
SELECT is(pg_temp.seen('anon', 'T'), '', 'visitor: reads nothing of T');
SELECT is(pg_temp.seen('anon', 'U'), '', 'visitor: reads nothing of U');
-- The admin's inbox counts rows per ticket with the admin's session (pages/admin/feedback.tsx).
SELECT is(pg_temp.ask('admin', format(
  $q$SELECT count(*)::text FROM public.feedback_activity WHERE feedback_id = %L$q$, pg_temp.ticket('T'))), '6',
  'admin: the inbox count of T counts every row');

-- ---------------------------------------------------------------------------
-- (3) Add, change, delete per role
-- ---------------------------------------------------------------------------
-- add
SELECT is(pg_temp.act('anon', pg_temp.ins('14300000-0000-4000-8000-0000000000d1', 'T', 'r', 'visitante', NULL)), '42501',
  'visitor: cannot add a row');
SELECT is(pg_temp.act('r', pg_temp.ins('14300000-0000-4000-8000-0000000000d2', 'U', 'r', 'R en U', NULL)), '42501',
  'reporter: cannot add a row on another person''s ticket U');
SELECT is(pg_temp.act('r', pg_temp.ins('14300000-0000-4000-8000-0000000000d3', 'T', 'admin', 'R firma como A', 'true')), '42501',
  'reporter: cannot add a row on T in the admin''s name');
SELECT is(pg_temp.act('p', pg_temp.ins('14300000-0000-4000-8000-0000000000d4', 'T', 'p', 'P en T', NULL)), '42501',
  'another person: cannot add a row on T');
SELECT is((SELECT count(*)::int FROM public.feedback_activity WHERE id::text LIKE '14300000-0000-4000-8000-0000000000d%'), 0,
  'none of the refused adds left a row');

-- change: the reporter cannot turn a note into a reply, nor touch their own rows
SELECT is(pg_temp.act('r', format('UPDATE public.feedback_activity SET visible_to_reporter = true WHERE id = %L', pg_temp.r('T_A_note'))), 'rows:0',
  'reporter: cannot mark the admin''s note for themselves');
SELECT is(pg_temp.act('r', format('UPDATE public.feedback_activity SET visible_to_reporter = true WHERE id = %L', pg_temp.r('T_R_false'))), 'rows:0',
  'reporter: cannot change the column on their own row');
SELECT is(pg_temp.act('r', format('UPDATE public.feedback_activity SET message = ''cambiado'' WHERE feedback_id = %L', pg_temp.ticket('T'))), 'rows:0',
  'reporter: cannot change any row of T');
SELECT is(pg_temp.act('p', format('UPDATE public.feedback_activity SET message = ''cambiado'' WHERE feedback_id = %L', pg_temp.ticket('T'))), 'rows:0',
  'another person: cannot change any row of T');
SELECT is(pg_temp.act('anon', format('UPDATE public.feedback_activity SET message = ''cambiado'' WHERE feedback_id = %L', pg_temp.ticket('T'))), 'rows:0',
  'visitor: cannot change any row of T');
SELECT is(pg_temp.ask('admin', format($q$SELECT visible_to_reporter::text || '/' || message FROM public.feedback_activity WHERE id = %L$q$, pg_temp.r('T_A_note'))), 'false/Nota interna de A',
  'the admin''s note is unchanged after the refused changes');
SELECT is((SELECT count(*)::int FROM public.feedback_activity WHERE feedback_id = pg_temp.ticket('T')::uuid AND message = 'cambiado'), 0,
  'no row of T was changed by the refused changes');
SELECT is(pg_temp.act('admin', format('UPDATE public.feedback_activity SET message = ''cambiado por A'' WHERE id = %L', pg_temp.r('T_A_spare'))), 'rows:1',
  'admin: can change a row');

-- The writers' own INSERT ... RETURNING and UPDATE ... RETURNING in one statement
-- (what an application's .insert(...).select() sends) still read their row back.
SELECT is(pg_temp.ask('r', format(
  $q$INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message)
     VALUES ('14300000-0000-4000-8000-0000000000e1', %L, 'R con RETURNING', %L, false) RETURNING message$q$,
  pg_temp.ticket('T'), pg_temp.uid('r'))), 'R con RETURNING',
  'reporter: INSERT ... RETURNING of their own comment reads it back');
SELECT is(pg_temp.ask('admin', format(
  $q$INSERT INTO public.feedback_activity (id, feedback_id, message, created_by, is_system_message, visible_to_reporter)
     VALUES ('14300000-0000-4000-8000-0000000000e2', %L, 'A con RETURNING', %L, false, true) RETURNING message || '/' || visible_to_reporter::text$q$,
  pg_temp.ticket('U'), pg_temp.uid('admin'))), 'A con RETURNING/true',
  'admin: INSERT ... RETURNING of a reply reads it back');
SELECT is(pg_temp.ask('admin', $q$UPDATE public.feedback_activity SET message = 'A cambiado' WHERE id = '14300000-0000-4000-8000-0000000000e2' RETURNING message$q$),
  'A cambiado', 'admin: UPDATE ... RETURNING reads the row back');

-- delete
SELECT is(pg_temp.act('r', format('DELETE FROM public.feedback_activity WHERE feedback_id = %L', pg_temp.ticket('T'))), 'rows:0',
  'reporter: cannot delete any row of T, their own included');
SELECT is(pg_temp.act('p', format('DELETE FROM public.feedback_activity WHERE feedback_id = %L', pg_temp.ticket('T'))), 'rows:0',
  'another person: cannot delete any row of T');
SELECT is(pg_temp.act('anon', format('DELETE FROM public.feedback_activity WHERE feedback_id = %L', pg_temp.ticket('T'))), 'rows:0',
  'visitor: cannot delete any row of T');
SELECT is((SELECT count(*)::int FROM public.feedback_activity WHERE feedback_id = pg_temp.ticket('T')::uuid), 7,
  'T still has its seven rows after the refused deletes');
SELECT is(pg_temp.act('admin', format('DELETE FROM public.feedback_activity WHERE id = %L', pg_temp.r('T_A_spare'))), 'rows:1',
  'admin: can delete a row');

-- ---------------------------------------------------------------------------
-- (4) The state-change trigger still writes its line, not marked for the reporter
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.act('admin', format('UPDATE public.platform_feedback SET status = ''in_progress'' WHERE id = %L', pg_temp.ticket('T'))), 'rows:1',
  'admin: changes the state of T');
SELECT is((SELECT count(*)::int FROM public.feedback_activity WHERE feedback_id = pg_temp.ticket('T')::uuid AND is_system_message), 1,
  'the state change wrote one system line on T');
SELECT is(pg_temp.ask('admin', format($q$SELECT visible_to_reporter::text FROM public.feedback_activity WHERE feedback_id = %L AND is_system_message$q$, pg_temp.ticket('T'))), 'false',
  'the system line is not marked for the reporter');
SELECT is((SELECT created_by FROM public.feedback_activity WHERE feedback_id = pg_temp.ticket('T')::uuid AND is_system_message), pg_temp.uid('r'),
  'the system line is still written in the reporter''s name (unchanged trigger)');
SELECT is(pg_temp.seen('admin', 'T'), 'T_A_note,T_A_reply,T_R,T_R_false,T_R_ret,T_R_true,sys',
  'admin: reads the system line with the rest of T');

SELECT * FROM finish();
ROLLBACK;
