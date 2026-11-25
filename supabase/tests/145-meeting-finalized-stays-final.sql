-- =============================================================================
-- 145-meeting-finalized-stays-final.sql — GENERA fixes F18, build A, item
-- EC-R6: migration 20261118107000_meeting_finalized_stays_final.sql.
--
-- Owner rule (17 Nov 2026): a meeting starts as a draft and is finalised ONCE.
-- A finalised meeting (one that carries finalized_at) never leaves
-- «completada» for a signed-in person; its text can still be corrected. The
-- finalisation's own fields (finalized_at, finalized_by, finalize_audience,
-- finalize_with_access) are written only by the finalize route (service key,
-- auth.uid() NULL). A meeting already trapped by the old defect (finalized_at
-- set, status not completada) may only move back to completada.
--
--   0. catalog: the new trigger and its function, not executable by anon or
--      authenticated
--   1. per editor (creator, the community's leader, a consultor, an admin),
--      each with their own session, on their own set of meetings:
--        M finalised, D draft, L legacy (completada without finalized_at),
--        T trapped (finalized_at set, status borrador)
--   2. the service role still finalises a draft
--   3. an outsider still updates nothing
--
-- Invented people and data only. Synthetic/local state only. Rolls back.
-- DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(76);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated, service_role;
CREATE TEMP TABLE mt (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON mt TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.mid(name text) RETURNS uuid AS $$
  SELECT id FROM mt WHERE k = name;
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
  PERFORM tests.authenticate_as('f18a_' || p);
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

-- The 17 checks of one editor on their own four meetings. Called after the
-- caller has switched to that editor's session, so every statement runs as
-- that person and row level security plus the triggers decide.
CREATE OR REPLACE FUNCTION pg_temp.editor_checks(p text) RETURNS SETOF text AS $$
DECLARE
  m uuid := pg_temp.mid('M_' || p);
  d uuid := pg_temp.mid('D_' || p);
  l uuid := pg_temp.mid('L_' || p);
  t uuid := pg_temp.mid('T_' || p);
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['borrador', 'programada', 'en_progreso'] LOOP
    RETURN NEXT throws_ok(
      format('UPDATE public.community_meetings SET status = %L WHERE id = %L', s, m),
      '42501', NULL, format('%s: a finalised meeting cannot go to %s', p, s));
  END LOOP;
  -- Send-back 1: the status column is nullable; NULL is not completada either.
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET status = NULL WHERE id = %L', m),
    '42501', NULL, format('%s: a finalised meeting cannot have its state set to NULL', p));
  RETURN NEXT is(
    pg_temp.exec_count(format('UPDATE public.community_meetings SET title = title || %L WHERE id = %L', ' (corregida)', m)),
    1, format('%s: the title of a finalised meeting can be corrected', p));
  RETURN NEXT ok(
    (SELECT status::text = 'completada' AND finalized_at = '2026-11-10 12:00:00+00'::timestamptz
       FROM public.community_meetings WHERE id = m),
    format('%s: after the correction it is still completada with the same finalized_at', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET finalized_at = now() WHERE id = %L', m),
    '42501', NULL, format('%s: finalized_at of a finalised meeting cannot be changed', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET finalized_by = NULL WHERE id = %L', m),
    '42501', NULL, format('%s: finalized_by of a finalised meeting cannot be changed', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET finalize_audience = %L WHERE id = %L', 'attended', m),
    '42501', NULL, format('%s: finalize_audience of a finalised meeting cannot be changed', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET finalize_with_access = NULL WHERE id = %L', m),
    '42501', NULL, format('%s: finalize_with_access of a finalised meeting cannot be changed', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET finalized_at = now() WHERE id = %L', d),
    '42501', NULL, format('%s: a draft cannot be given a finalized_at directly', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET finalized_by = auth.uid() WHERE id = %L', d),
    '42501', NULL, format('%s: a draft cannot be given a finalized_by directly', p));
  RETURN NEXT is(
    pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'en_progreso', d)),
    1, format('%s: a draft can go to en_progreso', p));
  RETURN NEXT is(
    pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'borrador', d)),
    1, format('%s: and back to borrador', p));
  RETURN NEXT is(
    pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'borrador', l)),
    1, format('%s: a legacy completada meeting without finalized_at can become a draft', p));
  RETURN NEXT throws_ok(
    format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'programada', t),
    '42501', NULL, format('%s: a trapped meeting cannot go to programada', p));
  RETURN NEXT is(
    pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'completada', t)),
    1, format('%s: a trapped meeting can go back to completada', p));
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: auth.uid() is NULL, so no guard applies).
-- One community and workspace; four editors and an outsider.
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('f18a_' || p, 'f18a-' || p || '@example.test')
FROM unnest(ARRAY['creator', 'leader', 'consultor', 'admin', 'outsider']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, name) VALUES
  ('18a00000-0000-4000-8000-0000000000c1', 'F18A Comunidad');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('18a00000-0000-4000-8000-0000000000a1', '18a00000-0000-4000-8000-0000000000c1');
INSERT INTO public.user_roles (user_id, role_type, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, c::uuid, true FROM (VALUES
  ('creator', 'docente', '18a00000-0000-4000-8000-0000000000c1'),
  ('leader', 'lider_comunidad', '18a00000-0000-4000-8000-0000000000c1'),
  ('consultor', 'consultor', NULL),
  ('admin', 'admin', NULL)) v(p, r, c);

-- Four meetings per editor plus one draft for the service role. All are
-- created by `creator`, so every editor reaches them through their own right.
INSERT INTO mt (k, id)
SELECT kind || '_' || p, gen_random_uuid()
FROM unnest(ARRAY['M', 'D', 'L', 'T']) kind, unnest(ARRAY['creator', 'leader', 'consultor', 'admin']) p;
INSERT INTO mt (k, id) VALUES ('D_service', gen_random_uuid());
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by, status)
SELECT id, '18a00000-0000-4000-8000-0000000000a1', 'F18A ' || k, now() + interval '1 day', pg_temp.uid('creator'),
       (CASE left(k, 1) WHEN 'M' THEN 'completada' WHEN 'L' THEN 'completada' ELSE 'borrador' END)::meeting_status
FROM mt;
UPDATE public.community_meetings
   SET finalized_at = '2026-11-10 12:00:00+00', finalized_by = pg_temp.uid('creator'),
       finalize_audience = 'community', finalize_with_access = true
 WHERE id IN (SELECT id FROM mt WHERE left(k, 1) IN ('M', 'T'));
-- EC-R16 (20261125101000): an un-named consultor no longer reaches a draft, so the consultor is named facilitator of its drafts.
UPDATE public.community_meetings SET facilitator_id = pg_temp.uid('consultor') WHERE id IN (pg_temp.mid('D_consultor'), pg_temp.mid('T_consultor'), pg_temp.mid('L_consultor'));

-- ---------------------------------------------------------------------------
-- 0. Catalog
-- ---------------------------------------------------------------------------
SELECT has_trigger('public', 'community_meetings', 'trg_guard_meeting_finalized_stays_final',
  'community_meetings has the finalised-stays-final trigger');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
   WHERE p.proname = 'guard_meeting_finalized_stays_final' AND p.pronamespace = 'public'::regnamespace
     AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public, pg_temp']),
  'the guard function is SECURITY DEFINER with a pinned search_path');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
   WHERE p.proname = 'guard_meeting_finalized_stays_final' AND p.pronamespace = 'public'::regnamespace
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'the guard function is not executable by anon or authenticated');

-- ---------------------------------------------------------------------------
-- 1. Each editor with their own session
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');
SELECT * FROM pg_temp.editor_checks('creator');
SELECT pg_temp.as_user('leader');
SELECT * FROM pg_temp.editor_checks('leader');
SELECT pg_temp.as_user('consultor');
SELECT * FROM pg_temp.editor_checks('consultor');
SELECT pg_temp.as_user('admin');
SELECT * FROM pg_temp.editor_checks('admin');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 2. The service role (the finalize route) still finalises a draft
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT is(
  pg_temp.exec_count(format(
    'UPDATE public.community_meetings SET status = %L, finalized_at = now(), finalized_by = %L, finalize_audience = %L, finalize_with_access = true WHERE id = %L AND finalized_at IS NULL',
    'completada', pg_temp.uid('creator'), 'community', pg_temp.mid('D_service'))),
  1, 'service role: a draft is finalised (status and the finalisation fields)');
SELECT pg_temp.reset_auth();
SELECT ok((SELECT status::text = 'completada' AND finalized_at IS NOT NULL AND finalized_by = pg_temp.uid('creator')
             FROM public.community_meetings WHERE id = pg_temp.mid('D_service')),
  'service role: the finalised draft carries its finalisation');

-- ---------------------------------------------------------------------------
-- 3. An outsider still updates nothing (existing rule)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('outsider');
SELECT is(pg_temp.exec_count(format('UPDATE public.community_meetings SET title = title || %L WHERE id = %L', '!', pg_temp.mid('M_creator'))),
  0, 'outsider: changes no title of a finalised meeting');
SELECT is(pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'borrador', pg_temp.mid('M_creator'))),
  0, 'outsider: changes no state of a finalised meeting');
SELECT is(pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'en_progreso', pg_temp.mid('D_creator'))),
  0, 'outsider: changes no state of a draft');
SELECT pg_temp.reset_auth();

SELECT * FROM finish();
ROLLBACK;
