-- =============================================================================
-- 146-thread-counters.sql — GENERA fixes F18f (19 Nov 2026):
-- Espacio Colaborativo «Mensajes»: a thread's counters are kept by the database.
--
--   EC-M4  message_count, participant_count and last_message_at of a thread
--          follow the messages that are not deleted, for every writer
--          (trigger trg_refresh_thread_counters on community_messages calling
--          public.refresh_thread_counters(), migration
--          20261118108000_thread_counters.sql); the migration's backfill
--          statement repairs spoiled counters; a member still cannot update
--          another person's thread directly; an outsider still cannot write a
--          message; a group-assignment thread counts too.
--
-- Personas (invented): leader L (lider_comunidad of community A), members M1
-- and M2 (docentes of community A), outsider O (docente of community B of
-- another school).
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT * FROM no_plan();

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.affected(stmt text) RETURNS integer
LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN EXECUTE stmt; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
-- The stored counters of a thread, read as postgres: 'messages/participants'.
CREATE OR REPLACE FUNCTION pg_temp.counters(t uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT message_count || '/' || participant_count FROM public.message_threads WHERE id = t
$$;
CREATE OR REPLACE FUNCTION pg_temp.last_at(t uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT last_message_at FROM public.message_threads WHERE id = t
$$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('f18f_leader');
SELECT tests.create_supabase_user('f18f_m1');
SELECT tests.create_supabase_user('f18f_m2');
SELECT tests.create_supabase_user('f18f_out');

INSERT INTO public.profiles (id, email, name, first_name, last_name, approval_status)
SELECT pg_temp.uid(k), k || '@f18f.test.local', k, fn, ln, 'approved'
  FROM (VALUES ('f18f_leader', 'Lía', 'Líder'), ('f18f_m1', 'Mario', 'Uno'), ('f18f_m2', 'Marta', 'Dos'),
               ('f18f_out', 'Óscar', 'Fuera')) v(k, fn, ln)
ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  email = EXCLUDED.email, approval_status = 'approved';

INSERT INTO public.schools (id, name) VALUES
  (914601, 'F18f school (pgTAP 146)'), (914602, 'F18f other school (pgTAP 146)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('14600000-0000-4000-8000-0000000000c1', 914601, 'F18f community A'),
  ('14600000-0000-4000-8000-0000000000c2', 914602, 'F18f community B');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('14600000-0000-4000-8000-0000000000b1', '14600000-0000-4000-8000-0000000000c1', 'F18f workspace A'),
  ('14600000-0000-4000-8000-0000000000b2', '14600000-0000-4000-8000-0000000000c2', 'F18f workspace B');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f18f_leader'), 'lider_comunidad', 914601, '14600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f18f_m1'),     'docente',         914601, '14600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f18f_m2'),     'docente',         914601, '14600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f18f_out'),    'docente',         914602, '14600000-0000-4000-8000-0000000000c2', true);

-- ----------------------------------------------------------------------------
-- The thread, created by L as the application does (counters written 1 and 1
-- by hand), with L's first message three hours ago.
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f18f_leader');
SELECT lives_ok($q$INSERT INTO public.message_threads (id, workspace_id, thread_title, description, category, created_by,
                      is_pinned, is_locked, is_archived, last_message_at, message_count, participant_count)
                    VALUES ('14600000-0000-4000-8000-000000000301', '14600000-0000-4000-8000-0000000000b1', 'F18f thread',
                      'd', 'general', auth.uid(), false, false, false, now() - interval '3 hours', 1, 1)$q$,
  'EC-M4 fixture: L creates the thread as the application does');
SELECT lives_ok($q$INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content, created_at)
                    VALUES ('14600000-0000-4000-8000-000000000401', '14600000-0000-4000-8000-0000000000b1',
                      '14600000-0000-4000-8000-000000000301', auth.uid(), 'Mensaje de L', now() - interval '3 hours')$q$,
  'EC-M4 fixture: L writes the first message');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '1/1',
  'EC-M4: after the first message the thread reads 1 message, 1 participant');

-- M1 and M2 each write a message with their own session.
SELECT tests.authenticate_as('f18f_m1');
SELECT lives_ok($q$INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content, created_at)
                    VALUES ('14600000-0000-4000-8000-000000000402', '14600000-0000-4000-8000-0000000000b1',
                      '14600000-0000-4000-8000-000000000301', auth.uid(), 'Mensaje de M1', now() - interval '2 hours')$q$,
  'EC-M4: M1 writes a message in L''s thread');
RESET ROLE;
SELECT tests.authenticate_as('f18f_m2');
SELECT lives_ok($q$INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content, created_at)
                    VALUES ('14600000-0000-4000-8000-000000000403', '14600000-0000-4000-8000-0000000000b1',
                      '14600000-0000-4000-8000-000000000301', auth.uid(), 'Mensaje de M2', now() - interval '1 hour')$q$,
  'EC-M4: M2 writes a message in L''s thread');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '3/3',
  'EC-M4: after M1''s and M2''s messages the thread reads 3 messages, 3 participants');
SELECT is(pg_temp.last_at('14600000-0000-4000-8000-000000000301'),
  (SELECT created_at FROM public.community_messages WHERE id = '14600000-0000-4000-8000-000000000403'),
  'EC-M4: last_message_at is the time of M2''s message');

-- M1 writes a second message.
SELECT tests.authenticate_as('f18f_m1');
SELECT lives_ok($q$INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content, created_at)
                    VALUES ('14600000-0000-4000-8000-000000000404', '14600000-0000-4000-8000-0000000000b1',
                      '14600000-0000-4000-8000-000000000301', auth.uid(), 'Segundo de M1', now() - interval '30 minutes')$q$,
  'EC-M4: M1 writes a second message');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '4/3',
  'EC-M4: a second message by the same person: 4 messages, still 3 participants');

-- M1 marks their messages deleted, one by one, as the screen does.
SELECT tests.authenticate_as('f18f_m1');
SELECT is(pg_temp.affected($q$UPDATE public.community_messages SET is_deleted = true
                               WHERE id = '14600000-0000-4000-8000-000000000404'$q$), 1,
  'EC-M4: M1 marks their second message deleted');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '3/3',
  'EC-M4: a deleted message is not counted: 3 messages, 3 participants');
SELECT is(pg_temp.last_at('14600000-0000-4000-8000-000000000301'),
  (SELECT created_at FROM public.community_messages WHERE id = '14600000-0000-4000-8000-000000000403'),
  'EC-M4: last_message_at falls back to the latest message that is not deleted');
SELECT tests.authenticate_as('f18f_m1');
SELECT is(pg_temp.affected($q$UPDATE public.community_messages SET is_deleted = true
                               WHERE id = '14600000-0000-4000-8000-000000000402'$q$), 1,
  'EC-M4: M1 marks their other message deleted');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '2/2',
  'EC-M4: with both of M1''s messages deleted: 2 messages, 2 participants');

-- ----------------------------------------------------------------------------
-- A member still cannot update L's thread directly; an outsider cannot write.
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f18f_m1');
SELECT is(pg_temp.affected($q$UPDATE public.message_threads SET thread_title = 'Cambiado por M1'
                               WHERE id = '14600000-0000-4000-8000-000000000301'$q$), 0,
  'EC-M4: M1 cannot change the title of L''s thread (0 rows)');
SELECT is(pg_temp.affected($q$UPDATE public.message_threads SET message_count = 99, participant_count = 99
                               WHERE id = '14600000-0000-4000-8000-000000000301'$q$), 0,
  'EC-M4: M1 cannot write the counters of L''s thread (0 rows)');
RESET ROLE;
SELECT is((SELECT thread_title FROM public.message_threads WHERE id = '14600000-0000-4000-8000-000000000301'),
  'F18f thread', 'EC-M4: the title is unchanged');
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '2/2', 'EC-M4: the counters are unchanged');

SELECT tests.authenticate_as('f18f_out');
SELECT throws_ok($q$INSERT INTO public.community_messages (workspace_id, thread_id, author_id, content)
                    VALUES ('14600000-0000-4000-8000-0000000000b1', '14600000-0000-4000-8000-000000000301', auth.uid(), 'Intruso')$q$,
  '42501', NULL, 'EC-M4 outsider: a message into community A''s thread is refused (existing rule)');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '2/2',
  'EC-M4 outsider: the counters did not move');

-- ----------------------------------------------------------------------------
-- A thread whose every message is deleted: 0 and 0, last_message_at kept.
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f18f_m2');
SELECT lives_ok($q$INSERT INTO public.message_threads (id, workspace_id, thread_title, category, created_by,
                      last_message_at, message_count, participant_count)
                    VALUES ('14600000-0000-4000-8000-000000000302', '14600000-0000-4000-8000-0000000000b1', 'F18f empty',
                      'general', auth.uid(), now() - interval '5 hours', 1, 1)$q$,
  'EC-M4 fixture: M2 creates a second thread');
SELECT lives_ok($q$INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content, created_at)
                    VALUES ('14600000-0000-4000-8000-000000000405', '14600000-0000-4000-8000-0000000000b1',
                      '14600000-0000-4000-8000-000000000302', auth.uid(), 'Único', now() - interval '4 hours')$q$,
  'EC-M4 fixture: M2 writes its only message');
RESET ROLE;
CREATE TEMP TABLE f18f_before ON COMMIT DROP AS
  SELECT pg_temp.last_at('14600000-0000-4000-8000-000000000302') AS at;
SELECT tests.authenticate_as('f18f_m2');
SELECT is(pg_temp.affected($q$UPDATE public.community_messages SET is_deleted = true
                               WHERE id = '14600000-0000-4000-8000-000000000405'$q$), 1,
  'EC-M4: M2 marks the only message deleted');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000302'), '0/0',
  'EC-M4: a thread whose every message is deleted reads 0 messages, 0 participants');
SELECT is(pg_temp.last_at('14600000-0000-4000-8000-000000000302'), (SELECT at FROM f18f_before),
  'EC-M4: and its last_message_at is unchanged from before');
SELECT ok(pg_temp.last_at('14600000-0000-4000-8000-000000000302') IS NOT NULL,
  'EC-M4: last_message_at is never set to NULL');

-- ----------------------------------------------------------------------------
-- Repair of spoiled counters: through the trigger, and by the backfill.
-- ----------------------------------------------------------------------------
UPDATE public.message_threads SET message_count = 1, participant_count = 1, last_message_at = now() - interval '9 hours'
 WHERE id = '14600000-0000-4000-8000-000000000301';
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '1/1', 'EC-M4 fixture: counters spoiled as postgres');
-- Touching a message (is_deleted set to what it is) recounts the thread.
UPDATE public.community_messages SET is_deleted = is_deleted WHERE id = '14600000-0000-4000-8000-000000000401';
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301'), '2/2',
  'EC-M4: touching one message of the thread recounts it (2 messages, 2 participants)');
SELECT is(pg_temp.last_at('14600000-0000-4000-8000-000000000301'),
  (SELECT created_at FROM public.community_messages WHERE id = '14600000-0000-4000-8000-000000000403'),
  'EC-M4: and puts last_message_at back to the latest message that is not deleted');

UPDATE public.message_threads SET message_count = 7, participant_count = 5, last_message_at = now() - interval '9 hours'
 WHERE id = '14600000-0000-4000-8000-000000000301';
UPDATE public.message_threads SET message_count = 3, participant_count = 2
 WHERE id = '14600000-0000-4000-8000-000000000302';
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301') || ' ' || pg_temp.counters('14600000-0000-4000-8000-000000000302'),
  '7/5 3/2', 'EC-M4 fixture: counters of both threads spoiled as postgres');
-- The migration's backfill statement, copied word for word.
UPDATE public.message_threads t
   SET message_count = (SELECT count(*) FROM public.community_messages m
                         WHERE m.thread_id = t.id AND m.is_deleted = false),
       participant_count = (SELECT count(DISTINCT m.author_id) FROM public.community_messages m
                             WHERE m.thread_id = t.id AND m.is_deleted = false),
       last_message_at = COALESCE((SELECT max(m.created_at) FROM public.community_messages m
                                    WHERE m.thread_id = t.id AND m.is_deleted = false), t.last_message_at);
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000301') || ' ' || pg_temp.counters('14600000-0000-4000-8000-000000000302'),
  '2/2 0/0', 'EC-M4 backfill: both threads get their true counters back');
SELECT is(pg_temp.last_at('14600000-0000-4000-8000-000000000301'),
  (SELECT created_at FROM public.community_messages WHERE id = '14600000-0000-4000-8000-000000000403'),
  'EC-M4 backfill: last_message_at is the latest message that is not deleted');
SELECT is(pg_temp.last_at('14600000-0000-4000-8000-000000000302'), (SELECT at FROM f18f_before),
  'EC-M4 backfill: a thread with no counted message keeps its last_message_at');

-- ----------------------------------------------------------------------------
-- A group-assignment thread counts too; its identity guard lets the count through.
-- ----------------------------------------------------------------------------
INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id) VALUES
  ('14600000-0000-4000-8000-000000000031', 'f18f-assignment', '14600000-0000-4000-8000-0000000000c1', 'F18f group', 914601);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id) VALUES
  ('14600000-0000-4000-8000-000000000031', 'f18f-assignment', pg_temp.uid('f18f_m1')),
  ('14600000-0000-4000-8000-000000000031', 'f18f-assignment', pg_temp.uid('f18f_m2'));
INSERT INTO public.message_threads (id, workspace_id, thread_title, category, custom_category_name, assignment_group_id,
                                    created_by, last_message_at, message_count, participant_count)
VALUES ('14600000-0000-4000-8000-000000000303', '14600000-0000-4000-8000-0000000000b1', 'F18f group thread', 'custom',
        'group-assignment', '14600000-0000-4000-8000-000000000031', pg_temp.uid('f18f_m1'), now() - interval '6 hours', 0, 0);
SELECT tests.authenticate_as('f18f_m1');
SELECT lives_ok($q$INSERT INTO public.community_messages (workspace_id, thread_id, author_id, content)
                    VALUES ('14600000-0000-4000-8000-0000000000b1', '14600000-0000-4000-8000-000000000303', auth.uid(), 'Grupo M1')$q$,
  'EC-M4 group: M1 writes in the group-assignment thread');
RESET ROLE;
SELECT tests.authenticate_as('f18f_m2');
SELECT lives_ok($q$INSERT INTO public.community_messages (workspace_id, thread_id, author_id, content)
                    VALUES ('14600000-0000-4000-8000-0000000000b1', '14600000-0000-4000-8000-000000000303', auth.uid(), 'Grupo M2')$q$,
  'EC-M4 group: M2 writes in the group-assignment thread (the identity guard does not refuse the count)');
RESET ROLE;
SELECT is(pg_temp.counters('14600000-0000-4000-8000-000000000303'), '2/2',
  'EC-M4 group: the group-assignment thread reads 2 messages, 2 participants');
SELECT is((SELECT custom_category_name || ' ' || assignment_group_id::text FROM public.message_threads
            WHERE id = '14600000-0000-4000-8000-000000000303'),
  'group-assignment 14600000-0000-4000-8000-000000000031', 'EC-M4 group: the thread''s identity is unchanged');

-- ----------------------------------------------------------------------------
-- Catalog: the function and its trigger
-- ----------------------------------------------------------------------------
SELECT ok(to_regprocedure('public.refresh_thread_counters()') IS NOT NULL,
  'EC-M4 catalog: public.refresh_thread_counters() exists');
SELECT ok(COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.refresh_thread_counters()')), false),
  'EC-M4 catalog: it is SECURITY DEFINER');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.refresh_thread_counters()')),
  ARRAY['search_path=public, pg_temp'], 'EC-M4 catalog: search_path = public, pg_temp');
SELECT ok(CASE WHEN to_regprocedure('public.refresh_thread_counters()') IS NULL THEN false
               ELSE NOT has_function_privilege('anon', 'public.refresh_thread_counters()', 'EXECUTE') END,
  'EC-M4 catalog: anon may not execute it');
SELECT ok(CASE WHEN to_regprocedure('public.refresh_thread_counters()') IS NULL THEN false
               ELSE NOT has_function_privilege('authenticated', 'public.refresh_thread_counters()', 'EXECUTE') END,
  'EC-M4 catalog: authenticated may not execute it');
SELECT is((SELECT count(*)::int FROM pg_trigger
            WHERE tgrelid = 'public.community_messages'::regclass AND tgname = 'trg_refresh_thread_counters'
              AND NOT tgisinternal AND tgfoid = to_regprocedure('public.refresh_thread_counters()')), 1,
  'EC-M4 catalog: trigger trg_refresh_thread_counters on community_messages calls it');
SELECT is((SELECT count(*)::int FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
            WHERE p.proname = 'update_thread_stats' AND NOT t.tgisinternal), 0,
  'EC-M4 catalog: update_thread_stats is still used by no trigger (left alone)');

SELECT * FROM finish();
ROLLBACK;
