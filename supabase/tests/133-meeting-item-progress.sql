-- =============================================================================
-- 133-meeting-item-progress.sql — GENERA fixes F12a, EC-R3 + R15: migration
-- 20261117162000_meeting_item_progress.sql.
--
-- public.update_meeting_item_progress(p_kind, p_id, p_status, p_progress,
-- p_notes) lets a verified editor of the meeting, or the person a task or
-- commitment is assigned to, set its state, progress and note; reopening
-- clears completed_at. Nothing else of the row changes, and no rule (policy)
-- on the two tables changes: a direct update by the person in charge stays
-- refused.
--
--   1. catalog: definer, search_path, grants (no PUBLIC, no anon)
--   2. refused callers: anon, a person with no role, a member of another
--      community, a member who is neither editor nor in charge (row
--      byte-identical), a forced-password-change assignee, a missing row
--   3. the person in charge of a task: progress + note, complete, reopen;
--      identity columns unchanged after every call
--   4. the same for a commitment
--   5. a verified editor (the community's leader) on any item of the meeting
--   6. a direct table update by the person in charge still changes nothing
--   7. invalid kind and progress refused; empty / NULL notes keep the note
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(60);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.reset_auth() RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.as_user(p text) RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.authenticate_as('f12a_' || p);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
-- Whole row as text (read as the session role, so RLS does not hide it).
CREATE OR REPLACE FUNCTION pg_temp.row_text(k text, i uuid) RETURNS text AS $$
  SELECT CASE WHEN k = 'task'
    THEN (SELECT row_to_json(t)::text FROM public.meeting_tasks t WHERE t.id = i)
    ELSE (SELECT row_to_json(c)::text FROM public.meeting_commitments c WHERE c.id = i) END;
$$ LANGUAGE sql;
-- The columns the person in charge must never change.
CREATE OR REPLACE FUNCTION pg_temp.identity(k text, i uuid) RETURNS text AS $$
  SELECT CASE WHEN k = 'task'
    THEN (SELECT concat_ws('|', t.task_title, t.task_description, t.due_date, t.assigned_to, t.meeting_id, t.priority, t.category)
            FROM public.meeting_tasks t WHERE t.id = i)
    ELSE (SELECT concat_ws('|', c.commitment_text, c.due_date, c.assigned_to, c.meeting_id)
            FROM public.meeting_commitments c WHERE c.id = i) END;
$$ LANGUAGE sql;
-- status|progress|completed_at set?|notes
CREATE OR REPLACE FUNCTION pg_temp.progress(k text, i uuid) RETURNS text AS $$
  SELECT CASE WHEN k = 'task'
    THEN (SELECT concat_ws('|', t.status, t.progress_percentage, t.completed_at IS NOT NULL, coalesce(t.notes, '<null>'))
            FROM public.meeting_tasks t WHERE t.id = i)
    ELSE (SELECT concat_ws('|', c.status, c.progress_percentage, c.completed_at IS NOT NULL, coalesce(c.notes, '<null>'))
            FROM public.meeting_commitments c WHERE c.id = i) END;
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.exec_count(q text) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE TEMP TABLE before_rows (k text PRIMARY KEY, v text) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Community A (workspace A): meeting M1 created by
-- `creator`; task T1 and commitment C1 assigned to `assignee`; task T2 and
-- commitment C2 assigned to `member`; task T3 assigned to `gated` (forced
-- password change). `leader` leads community A. `outsider` is a member of
-- community B. `nobody` has no role.
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('f12a_' || p, 'f12a-' || p || '@example.test')
FROM unnest(ARRAY['creator','leader','assignee','member','outsider','nobody','gated']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET must_change_password = true WHERE id = pg_temp.uid('gated');
INSERT INTO public.growth_communities (id, name) VALUES
  ('f12a0000-0000-4000-8000-0000000000c1', 'F12A Comunidad A'),
  ('f12a0000-0000-4000-8000-0000000000c2', 'F12A Comunidad B');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('f12a0000-0000-4000-8000-0000000000a1', 'f12a0000-0000-4000-8000-0000000000c1'),
  ('f12a0000-0000-4000-8000-0000000000a2', 'f12a0000-0000-4000-8000-0000000000c2');
INSERT INTO public.user_roles (user_id, role_type, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, c::uuid, true FROM (VALUES
  ('creator', 'docente', 'f12a0000-0000-4000-8000-0000000000c1'),
  ('leader', 'lider_comunidad', 'f12a0000-0000-4000-8000-0000000000c1'),
  ('assignee', 'docente', 'f12a0000-0000-4000-8000-0000000000c1'),
  ('member', 'docente', 'f12a0000-0000-4000-8000-0000000000c1'),
  ('gated', 'docente', 'f12a0000-0000-4000-8000-0000000000c1'),
  ('outsider', 'docente', 'f12a0000-0000-4000-8000-0000000000c2')) v(p, r, c);
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by)
VALUES ('f12a0000-0000-4000-8000-0000000000e1', 'f12a0000-0000-4000-8000-0000000000a1', 'F12A M1', now() - interval '1 day', pg_temp.uid('creator'));
INSERT INTO public.meeting_attendees (meeting_id, user_id, role)
SELECT 'f12a0000-0000-4000-8000-0000000000e1', pg_temp.uid(p), 'participant' FROM unnest(ARRAY['assignee','member','gated']) p;
INSERT INTO public.meeting_tasks (id, meeting_id, task_title, task_description, assigned_to, due_date, notes) VALUES
  ('f12a0000-0000-4000-8000-0000000000f1', 'f12a0000-0000-4000-8000-0000000000e1', 'Preparar informe', 'Descripción', pg_temp.uid('assignee'), current_date + 7, 'nota inicial'),
  ('f12a0000-0000-4000-8000-0000000000f2', 'f12a0000-0000-4000-8000-0000000000e1', 'Revisar pauta', NULL, pg_temp.uid('member'), current_date + 7, NULL),
  ('f12a0000-0000-4000-8000-0000000000f3', 'f12a0000-0000-4000-8000-0000000000e1', 'Tarea bloqueada', NULL, pg_temp.uid('gated'), current_date + 7, NULL);
INSERT INTO public.meeting_commitments (id, meeting_id, commitment_text, assigned_to, due_date) VALUES
  ('f12a0000-0000-4000-8000-0000000000d1', 'f12a0000-0000-4000-8000-0000000000e1', 'Enviar acta', pg_temp.uid('assignee'), current_date + 3),
  ('f12a0000-0000-4000-8000-0000000000d2', 'f12a0000-0000-4000-8000-0000000000e1', 'Citar apoderados', pg_temp.uid('member'), current_date + 3);
CREATE TEMP TABLE ident0 ON COMMIT DROP AS
SELECT k, i, pg_temp.identity(k, i::uuid) AS v FROM (VALUES
  ('task', 'f12a0000-0000-4000-8000-0000000000f1'), ('task', 'f12a0000-0000-4000-8000-0000000000f2'),
  ('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), ('commitment', 'f12a0000-0000-4000-8000-0000000000d2')) v(k, i);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT has_function('public', 'update_meeting_item_progress', ARRAY['text','uuid','task_status','integer','text'], 'the function exists');
SELECT is_definer('public', 'update_meeting_item_progress', ARRAY['text','uuid','task_status','integer','text'], 'it is SECURITY DEFINER');
SELECT ok((SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid = 'public.update_meeting_item_progress(text,uuid,public.task_status,integer,text)'::regprocedure),
  'search_path is pinned to public, pg_temp');
SELECT ok(NOT has_function_privilege('anon', 'public.update_meeting_item_progress(text,uuid,public.task_status,integer,text)', 'EXECUTE'), 'anon cannot execute');
SELECT ok(has_function_privilege('authenticated', 'public.update_meeting_item_progress(text,uuid,public.task_status,integer,text)', 'EXECUTE'), 'authenticated can execute');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                       WHERE p.oid = 'public.update_meeting_item_progress(text,uuid,public.task_status,integer,text)'::regprocedure
                         AND a.grantee = 0), 'PUBLIC holds no grant');
SELECT isnt(obj_description('public.update_meeting_item_progress(text,uuid,public.task_status,integer,text)'::regprocedure, 'pg_proc'), NULL, 'it has a comment');

-- ---------------------------------------------------------------------------
-- 2. Refused callers
-- ---------------------------------------------------------------------------
INSERT INTO before_rows SELECT 'f1', pg_temp.row_text('task', 'f12a0000-0000-4000-8000-0000000000f1');
INSERT INTO before_rows SELECT 'd1', pg_temp.row_text('commitment', 'f12a0000-0000-4000-8000-0000000000d1');

SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 50, 'x')$$,
  '42501', NULL, 'anon is refused');

SELECT pg_temp.as_user('nobody');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 50, 'x')$$,
  '42501', 'not_allowed', 'a person with no role is refused');

SELECT pg_temp.as_user('outsider');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 50, 'x')$$,
  '42501', 'not_allowed', 'a member of another community is refused (task)');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1', 'en_progreso', 50, 'x')$$,
  '42501', 'not_allowed', 'a member of another community is refused (commitment)');

SELECT pg_temp.as_user('member');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'completado', 100, 'x')$$,
  '42501', 'not_allowed', 'a member neither editor nor in charge is refused (task)');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1', 'completado', 100, 'x')$$,
  '42501', 'not_allowed', 'a member neither editor nor in charge is refused (commitment)');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-00000000ffff', 'en_progreso', 10, NULL)$$,
  '42501', 'not_allowed', 'a missing row gets the same answer as a refused caller');

SELECT pg_temp.as_user('gated');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f3', 'en_progreso', 10, NULL)$$,
  '42501', 'not_allowed', 'a person in charge held by a forced password change is refused');

SELECT pg_temp.reset_auth();
SELECT is(pg_temp.row_text('task', 'f12a0000-0000-4000-8000-0000000000f1'), (SELECT v FROM before_rows WHERE k = 'f1'), 'refused calls left task T1 byte-identical');
SELECT is(pg_temp.row_text('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), (SELECT v FROM before_rows WHERE k = 'd1'), 'refused calls left commitment C1 byte-identical');
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f3'), 'pendiente|0|f|<null>', 'the gated task is unchanged');

-- ---------------------------------------------------------------------------
-- 3. The person in charge of a task
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('assignee');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 50, 'mitad hecha')$$,
  'the person in charge sets en_progreso / 50 / a note');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f1'), 'en_progreso|50|f|mitad hecha', 'stored: en_progreso, 50, no completed_at, the note');
SELECT is(pg_temp.identity('task', 'f12a0000-0000-4000-8000-0000000000f1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000f1'), 'title, description, date, assignee, meeting unchanged');

SELECT pg_temp.as_user('assignee');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'completado', 60, NULL)$$,
  'the person in charge completes the task');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f1'), 'completado|100|t|mitad hecha', 'stored: completado, 100, completed_at set, note kept');
SELECT is(pg_temp.identity('task', 'f12a0000-0000-4000-8000-0000000000f1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000f1'), 'identity unchanged after completing');

-- The screen's «Reabrir» sends en_progreso with the old progress (100).
SELECT pg_temp.as_user('assignee');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 100, NULL)$$,
  'the person in charge reopens the task');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f1'), 'en_progreso|100|f|mitad hecha', 'reopened: en_progreso, completed_at NULL');
SELECT is(pg_temp.identity('task', 'f12a0000-0000-4000-8000-0000000000f1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000f1'), 'identity unchanged after reopening');

-- ---------------------------------------------------------------------------
-- 4. The person in charge of a commitment
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('assignee');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1', 'en_progreso', 30, 'borrador del acta')$$,
  'the person in charge sets progress on a commitment');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), 'en_progreso|30|f|borrador del acta', 'commitment stored: en_progreso, 30, the note');
SELECT is(pg_temp.identity('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000d1'), 'commitment identity unchanged');

SELECT pg_temp.as_user('assignee');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1', 'completado', 30, NULL)$$,
  'the person in charge completes the commitment');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), 'completado|100|t|borrador del acta', 'commitment completed: 100, completed_at set');

SELECT pg_temp.as_user('assignee');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1', 'en_progreso', 100, NULL)$$,
  'the person in charge reopens the commitment');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), 'en_progreso|100|f|borrador del acta', 'commitment reopened: completed_at NULL');
SELECT is(pg_temp.identity('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000d1'), 'commitment identity unchanged after reopening');

-- The person in charge of T1 cannot touch T2 (someone else's) either.
SELECT pg_temp.as_user('assignee');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f2', 'en_progreso', 10, NULL)$$,
  '42501', 'not_allowed', 'the person in charge of one item is refused on another person''s item');

-- ---------------------------------------------------------------------------
-- 5. A verified editor (the community's leader) on any item of the meeting
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('leader');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f2', 'en_progreso', 40, 'revisado por líder')$$,
  'the leader sets progress on a task assigned to someone else');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f2', 'completado', 40, NULL)$$,
  'the leader completes it');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f2', 'en_progreso', 100, NULL)$$,
  'the leader reopens it');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('commitment', 'f12a0000-0000-4000-8000-0000000000d2', 'completado', 0, 'listo')$$,
  'the leader completes a commitment assigned to someone else');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f2'), 'en_progreso|100|f|revisado por líder', 'leader task: reopened, note kept');
SELECT is(pg_temp.progress('commitment', 'f12a0000-0000-4000-8000-0000000000d2'), 'completado|100|t|listo', 'leader commitment: completed');
SELECT is(pg_temp.identity('task', 'f12a0000-0000-4000-8000-0000000000f2'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000f2'), 'leader task identity unchanged');
SELECT is(pg_temp.identity('commitment', 'f12a0000-0000-4000-8000-0000000000d2'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000d2'), 'leader commitment identity unchanged');

SELECT pg_temp.as_user('creator');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f2', 'pendiente', 0, NULL)$$,
  'the meeting''s creator (a verified editor) updates a task too');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f2'), 'pendiente|0|f|revisado por líder', 'creator update stored');

-- ---------------------------------------------------------------------------
-- 6. A direct table update by the person in charge still changes nothing
-- ---------------------------------------------------------------------------
INSERT INTO before_rows SELECT 'f1-direct', pg_temp.row_text('task', 'f12a0000-0000-4000-8000-0000000000f1');
INSERT INTO before_rows SELECT 'd1-direct', pg_temp.row_text('commitment', 'f12a0000-0000-4000-8000-0000000000d1');
SELECT pg_temp.as_user('assignee');
SELECT is(pg_temp.exec_count($$UPDATE public.meeting_tasks SET task_title = 'Cambiado', status = 'completado', progress_percentage = 100, completed_at = now() WHERE id = 'f12a0000-0000-4000-8000-0000000000f1'$$),
  0, 'a direct task update by the person in charge matches no row');
SELECT is(pg_temp.exec_count($$UPDATE public.meeting_commitments SET commitment_text = 'Cambiado', due_date = current_date WHERE id = 'f12a0000-0000-4000-8000-0000000000d1'$$),
  0, 'a direct commitment update by the person in charge matches no row');
SELECT is(pg_temp.exec_count($$UPDATE public.meeting_tasks SET assigned_to = auth.uid() WHERE id = 'f12a0000-0000-4000-8000-0000000000f2'$$),
  0, 'a direct reassignment of another person''s task by the person in charge matches no row');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.row_text('task', 'f12a0000-0000-4000-8000-0000000000f1'), (SELECT v FROM before_rows WHERE k = 'f1-direct'), 'task T1 byte-identical after the direct update');
SELECT is(pg_temp.row_text('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), (SELECT v FROM before_rows WHERE k = 'd1-direct'), 'commitment C1 byte-identical after the direct update');

-- ---------------------------------------------------------------------------
-- 7. Invalid input; empty and NULL notes keep the note
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('assignee');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('agreement', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 10, NULL)$$,
  '22023', 'invalid_kind', 'an unknown kind is refused');
SELECT throws_ok($$SELECT public.update_meeting_item_progress(NULL, 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 10, NULL)$$,
  '22023', 'invalid_kind', 'a NULL kind is refused');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 101, NULL)$$,
  '22023', 'invalid_progress', 'progress above 100 is refused');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', -1, NULL)$$,
  '22023', 'invalid_progress', 'progress below 0 is refused');
SELECT throws_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', NULL, NULL)$$,
  '22023', 'invalid_progress', 'a NULL progress is refused');
SELECT lives_ok($$SELECT public.update_meeting_item_progress('task', 'f12a0000-0000-4000-8000-0000000000f1', 'en_progreso', 70, '')$$,
  'an empty note is accepted');
SELECT pg_temp.reset_auth();
SELECT is(pg_temp.progress('task', 'f12a0000-0000-4000-8000-0000000000f1'), 'en_progreso|70|f|mitad hecha', 'an empty note keeps the stored note');
SELECT is(pg_temp.identity('task', 'f12a0000-0000-4000-8000-0000000000f1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000f1'), 'identity unchanged at the end');
SELECT is(pg_temp.identity('commitment', 'f12a0000-0000-4000-8000-0000000000d1'), (SELECT v FROM ident0 WHERE i = 'f12a0000-0000-4000-8000-0000000000d1'), 'commitment identity unchanged at the end');

SELECT * FROM finish();
ROLLBACK;
