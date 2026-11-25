-- =============================================================================
-- 172-meeting-summary-outcomes.sql — GENERA fixes F25, build A, item EC-R7b:
-- migration 20261125100000_meeting_summary_outcomes.sql.
--
-- Owner decision (20 Nov 2026): the band of a finalised meeting names whom the
-- summary e-mail reached. The finalize route (service key) stores that once in
-- public.meeting_summary_outcomes; whoever can see the meeting reads it.
--
--   0. catalog: the table, its columns and types, primary key, the foreign key
--      ON DELETE CASCADE, RLS on, its policies and grants
--   1. reads: a member of the meeting's community reads the row, the creator,
--      leader and admin too; a person of another community reads none; anon
--      is refused
--   2. writes: a signed-in creator, leader and admin cannot INSERT, UPDATE or
--      DELETE a row
--   3. the service role inserts a row
--   4. deleting the meeting (as postgres) removes its row
--
-- Invented people and data only. Synthetic/local state only. Rolls back.
-- DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(31);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated, service_role;
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
  PERFORM tests.authenticate_as('f25a_' || p);
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
CREATE OR REPLACE FUNCTION pg_temp.exec_count(q text) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.rows_seen() RETURNS int AS $$
  SELECT count(*)::int FROM public.meeting_summary_outcomes
   WHERE meeting_id = '25a00000-0000-4000-8000-0000000000e1';
$$ LANGUAGE sql;

-- The three write checks of one signed-in editor, run in their own session.
CREATE OR REPLACE FUNCTION pg_temp.write_checks(p text) RETURNS SETOF text AS $$
BEGIN
  RETURN NEXT throws_ok(
    'INSERT INTO public.meeting_summary_outcomes (meeting_id) VALUES (''25a00000-0000-4000-8000-0000000000e2'')',
    '42501', NULL, format('%s: cannot insert an outcome row', p));
  RETURN NEXT throws_ok(
    'UPDATE public.meeting_summary_outcomes SET sent_to = ''{}'' WHERE meeting_id = ''25a00000-0000-4000-8000-0000000000e1''',
    '42501', NULL, format('%s: cannot update an outcome row', p));
  RETURN NEXT throws_ok(
    'DELETE FROM public.meeting_summary_outcomes WHERE meeting_id = ''25a00000-0000-4000-8000-0000000000e1''',
    '42501', NULL, format('%s: cannot delete an outcome row', p));
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Community C1 with its workspace and two finalised
-- meetings (E1 carries an outcome row, E2 is for the service role); community
-- C2 with one member. People: creator (docente of C1), leader (lider_comunidad
-- of C1), admin, member (docente of C1, not on the meeting), other (docente of C2).
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('f25a_' || p, 'f25a-' || p || '@example.test')
FROM unnest(ARRAY['creator', 'leader', 'admin', 'member', 'other']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, name) VALUES
  ('25a00000-0000-4000-8000-0000000000c1', 'F25A Comunidad Uno'),
  ('25a00000-0000-4000-8000-0000000000c2', 'F25A Comunidad Dos');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('25a00000-0000-4000-8000-0000000000a1', '25a00000-0000-4000-8000-0000000000c1'),
  ('25a00000-0000-4000-8000-0000000000a2', '25a00000-0000-4000-8000-0000000000c2');
INSERT INTO public.user_roles (user_id, role_type, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, c::uuid, true FROM (VALUES
  ('creator', 'docente', '25a00000-0000-4000-8000-0000000000c1'),
  ('leader', 'lider_comunidad', '25a00000-0000-4000-8000-0000000000c1'),
  ('admin', 'admin', NULL),
  ('member', 'docente', '25a00000-0000-4000-8000-0000000000c1'),
  ('other', 'docente', '25a00000-0000-4000-8000-0000000000c2')) v(p, r, c);
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by, status,
                                       finalized_at, finalized_by, finalize_audience, finalize_with_access)
SELECT m::uuid, '25a00000-0000-4000-8000-0000000000a1', 'F25A ' || m, now() - interval '1 day', pg_temp.uid('creator'),
       'completada'::meeting_status, '2026-11-20 12:00:00+00', pg_temp.uid('creator'), 'community', true
FROM unnest(ARRAY['25a00000-0000-4000-8000-0000000000e1', '25a00000-0000-4000-8000-0000000000e2']) m;
INSERT INTO public.meeting_summary_outcomes (meeting_id, sent_to, not_sent_to)
VALUES ('25a00000-0000-4000-8000-0000000000e1', ARRAY[pg_temp.uid('member')], ARRAY[pg_temp.uid('leader')]);

-- ---------------------------------------------------------------------------
-- 0. Catalog
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'meeting_summary_outcomes', 'the table meeting_summary_outcomes exists');
SELECT columns_are('public', 'meeting_summary_outcomes',
  ARRAY['meeting_id', 'sent_to', 'not_sent_to', 'recorded_at'], 'it has exactly its four columns');
SELECT col_type_is('public', 'meeting_summary_outcomes', 'meeting_id', 'uuid', 'meeting_id is uuid');
SELECT col_type_is('public', 'meeting_summary_outcomes', 'sent_to', 'uuid[]', 'sent_to is uuid[]');
SELECT col_type_is('public', 'meeting_summary_outcomes', 'not_sent_to', 'uuid[]', 'not_sent_to is uuid[]');
SELECT col_type_is('public', 'meeting_summary_outcomes', 'recorded_at', 'timestamp with time zone', 'recorded_at is timestamptz');
SELECT ok((SELECT bool_and(attnotnull) FROM pg_attribute
            WHERE attrelid = 'public.meeting_summary_outcomes'::regclass AND attnum > 0 AND NOT attisdropped),
  'every column is NOT NULL');
SELECT col_is_pk('public', 'meeting_summary_outcomes', 'meeting_id', 'meeting_id is the primary key');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
   WHERE conrelid = 'public.meeting_summary_outcomes'::regclass AND contype = 'f'
     AND confrelid = 'public.community_meetings'::regclass AND confdeltype = 'c'),
  'meeting_id references community_meetings ON DELETE CASCADE');
SELECT tests.rls_enabled('public', 'meeting_summary_outcomes');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s:%s', polname, polcmd, polpermissive, polroles::regrole[]::text) ORDER BY polname)
     FROM pg_policy WHERE polrelid = 'public.meeting_summary_outcomes'::regclass),
  ARRAY['Meeting readers see whom the summary reached:r:t:{authenticated}',
        'forced_password_change_guard:*:f:{authenticated}'],
  'policies: one SELECT policy for authenticated and the restrictive forced-password-change guard');
SELECT is(
  (SELECT array_agg(format('%s:%s', a.grantee::regrole::text, a.privilege_type) ORDER BY a.privilege_type)
     FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.meeting_summary_outcomes'::regclass AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  ARRAY['authenticated:SELECT'],
  'grants: authenticated may only SELECT; nothing for PUBLIC or anon');

-- ---------------------------------------------------------------------------
-- 1. Reads
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.rows_seen(), 1, 'member of the community: reads the outcome row of a meeting it can see');
SELECT ok((SELECT sent_to = ARRAY[pg_temp.uid('member')] AND not_sent_to = ARRAY[pg_temp.uid('leader')]
             FROM public.meeting_summary_outcomes WHERE meeting_id = '25a00000-0000-4000-8000-0000000000e1'),
  'member: reads both lists as stored');
SELECT pg_temp.as_user('creator');
SELECT is(pg_temp.rows_seen(), 1, 'creator: reads the outcome row');
SELECT pg_temp.as_user('leader');
SELECT is(pg_temp.rows_seen(), 1, 'leader: reads the outcome row');
SELECT pg_temp.as_user('admin');
SELECT is(pg_temp.rows_seen(), 1, 'admin: reads the outcome row');
SELECT pg_temp.as_user('other');
SELECT is(pg_temp.rows_seen(), 0, 'a person of another community reads no outcome row');
SELECT pg_temp.set_anon();
SELECT throws_ok('SELECT count(*) FROM public.meeting_summary_outcomes', '42501', NULL,
  'anon: reading the outcomes is refused (no grant)');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 2. Writes by signed-in editors: refused (no INSERT/UPDATE/DELETE grant)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');
SELECT * FROM pg_temp.write_checks('creator');
SELECT pg_temp.as_user('leader');
SELECT * FROM pg_temp.write_checks('leader');
SELECT pg_temp.as_user('admin');
SELECT * FROM pg_temp.write_checks('admin');
SELECT pg_temp.reset_auth();
SELECT ok((SELECT count(*) = 1 FROM public.meeting_summary_outcomes
            WHERE meeting_id IN ('25a00000-0000-4000-8000-0000000000e1', '25a00000-0000-4000-8000-0000000000e2')
              AND sent_to = ARRAY[pg_temp.uid('member')]),
  'after the refused writes the stored row is unchanged and no row was added');

-- ---------------------------------------------------------------------------
-- 3. The service role (the finalize route) inserts
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT is(
  pg_temp.exec_count(format(
    'INSERT INTO public.meeting_summary_outcomes (meeting_id, sent_to, not_sent_to) VALUES (%L, %L, %L)',
    '25a00000-0000-4000-8000-0000000000e2', ARRAY[pg_temp.uid('member')], '{}'::uuid[])),
  1, 'service role: inserts an outcome row');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 4. Deleting the meeting removes its outcome row
-- ---------------------------------------------------------------------------
DELETE FROM public.community_meetings WHERE id = '25a00000-0000-4000-8000-0000000000e2';
SELECT is((SELECT count(*)::int FROM public.meeting_summary_outcomes WHERE meeting_id = '25a00000-0000-4000-8000-0000000000e2'),
  0, 'deleting the meeting (as postgres) removes its outcome row');

SELECT * FROM finish();
ROLLBACK;
