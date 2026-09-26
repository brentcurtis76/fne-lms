-- =============================================================================
-- 073-meeting-agreements-tasks-rls.sql — W-B3a-01 (SM-22): migration
-- 20260925182000_meeting_agreements_tasks_rls.sql.
--
--   1. catalog: exact policy sets on meeting_agreements / meeting_tasks /
--      meeting_attendees / meeting_co_editor_grants; the grants table is closed
--   2. D1: a verified editor (creator) saves and reads back exact own rows;
--      facilitator and active lider_comunidad keep their baseline edit rights
--   3. D2: outsider (no role) and active read-only member cannot self-assign
--      co_editor; child SELECT / INSERT / UPDATE denied, including cross-tenant
--   4. D3: a historical co_editor row with no provenance gains no child access
--      and cannot grant; a grant made by a verified editor works; ordinary
--      attendee inserts still work
--   5. D4: anon, inactive role, wrong meeting, NULL meeting id, meeting-id move,
--      UPDATE / DELETE on both tables
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(118);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
-- API roles cannot use schema tests, so ids are cached in a readable temp table
-- and every role switch starts from the session role.
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
  PERFORM tests.authenticate_as('sm22_' || p);
END;
$$ LANGUAGE plpgsql;
-- Child-row operations run as the CURRENT role, so RLS decides each outcome.
CREATE OR REPLACE FUNCTION pg_temp.ins(t text, m uuid, label text) RETURNS void AS $$
BEGIN
  IF t = 'meeting_agreements' THEN
    INSERT INTO public.meeting_agreements (meeting_id, agreement_text) VALUES (m, label);
  ELSE
    INSERT INTO public.meeting_tasks (meeting_id, task_title, assigned_to) VALUES (m, label, pg_temp.uid('editor'));
  END IF;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.visible(t text, m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I WHERE meeting_id = $1', t) INTO n USING m;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
-- ROW_COUNT, so the result does not depend on the SELECT policy.
CREATE OR REPLACE FUNCTION pg_temp.upd(t text, m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE format('UPDATE public.%I SET updated_at = now() WHERE meeting_id = $1', t) USING m;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
-- No WHERE clause: reads no column, so only UPDATE policies apply.
CREATE OR REPLACE FUNCTION pg_temp.upd_all(t text) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE format('UPDATE public.%I SET updated_at = now()', t);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.del(t text, m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE format('DELETE FROM public.%I WHERE meeting_id = $1', t) USING m;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.move(t text, from_m uuid, to_m uuid) RETURNS void AS $$
BEGIN
  EXECUTE format('UPDATE public.%I SET meeting_id = $2 WHERE meeting_id = $1', t) USING from_m, to_m;
END;
$$ LANGUAGE plpgsql;
CREATE TEMP TABLE child_tables (t text) ON COMMIT DROP;
INSERT INTO child_tables VALUES ('meeting_agreements'), ('meeting_tasks');
GRANT SELECT ON child_tables TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Community A: meetings A1 (creator editor, facilitator
-- facilitator) and A2 (creator editor). Community B: meeting B1.
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('sm22_' || p, 'sm22-' || p || '@example.test')
FROM unnest(ARRAY['editor','facilitator','leader','inactive','member','legacy','grantee','outsider','editor_b']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, name) VALUES
  ('5e220000-0000-4000-8000-0000000000c1', 'SM22 Comunidad A'),
  ('5e220000-0000-4000-8000-0000000000c2', 'SM22 Comunidad B');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('5e220000-0000-4000-8000-0000000000a1', '5e220000-0000-4000-8000-0000000000c1'),
  ('5e220000-0000-4000-8000-0000000000a2', '5e220000-0000-4000-8000-0000000000c2');
INSERT INTO public.user_roles (user_id, role_type, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, c::uuid, a FROM (VALUES
  ('editor', 'docente', '5e220000-0000-4000-8000-0000000000c1', true),
  ('facilitator', 'docente', '5e220000-0000-4000-8000-0000000000c1', true),
  ('leader', 'lider_comunidad', '5e220000-0000-4000-8000-0000000000c1', true),
  ('inactive', 'lider_comunidad', '5e220000-0000-4000-8000-0000000000c1', false),
  ('member', 'docente', '5e220000-0000-4000-8000-0000000000c1', true),
  ('legacy', 'docente', '5e220000-0000-4000-8000-0000000000c1', true),
  ('grantee', 'docente', '5e220000-0000-4000-8000-0000000000c1', true),
  ('editor_b', 'docente', '5e220000-0000-4000-8000-0000000000c2', true)) v(p, r, c, a);
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by, facilitator_id) VALUES
  ('5e220000-0000-4000-8000-0000000000e1', '5e220000-0000-4000-8000-0000000000a1', 'SM22 A1', now() + interval '1 day', pg_temp.uid('editor'), pg_temp.uid('facilitator')),
  ('5e220000-0000-4000-8000-0000000000e2', '5e220000-0000-4000-8000-0000000000a1', 'SM22 A2', now() + interval '1 day', pg_temp.uid('editor'), NULL),
  ('5e220000-0000-4000-8000-0000000000e3', '5e220000-0000-4000-8000-0000000000a2', 'SM22 B1', now() + interval '1 day', pg_temp.uid('editor_b'), NULL);
SELECT pg_temp.ins(t, m::uuid, 'seed') FROM child_tables,
  unnest(ARRAY['5e220000-0000-4000-8000-0000000000e1', '5e220000-0000-4000-8000-0000000000e3']) m;
-- A historical self-granted co_editor row: written with no end-user identity,
-- exactly like rows that predate this migration, so it carries no provenance.
INSERT INTO public.meeting_attendees (meeting_id, user_id, role)
VALUES ('5e220000-0000-4000-8000-0000000000e1', pg_temp.uid('legacy'), 'co_editor');

-- ---------------------------------------------------------------------------
-- 1. Catalog (8)
-- ---------------------------------------------------------------------------
SELECT policies_are('public', 'meeting_agreements', ARRAY[
  'Meeting editors can update agreements', 'Users can delete agreements for deletable meetings', 'forced_password_change_guard',
  'Verified meeting editors can view agreements', 'Verified meeting editors can insert agreements',
  'Agreement updates require a verified meeting editor'], 'agreements: baseline policies kept, three added');
SELECT policies_are('public', 'meeting_tasks', ARRAY[
  'Meeting editors can update tasks', 'Users can delete tasks for deletable meetings', 'forced_password_change_guard',
  'Verified meeting editors can view tasks', 'Verified meeting editors can insert tasks',
  'Task updates require a verified meeting editor'], 'tasks: baseline policies kept, three added');
SELECT policies_are('public', 'meeting_attendees', ARRAY[
  'Meeting editors can update attendees', 'Users can delete attendees for deletable meetings', 'Users can delete meeting attendees',
  'Users can insert meeting attendees', 'Users can view meeting attendees', 'forced_password_change_guard',
  'Only verified meeting editors grant co_editor', 'Only verified meeting editors set co_editor'], 'attendees: baseline policies kept, two restrictive added');
SELECT policies_are('public', 'meeting_co_editor_grants', ARRAY['forced_password_change_guard'], 'grants: only the password guard');
SELECT tests.rls_enabled('public', 'meeting_co_editor_grants');
SELECT ok(NOT has_table_privilege('authenticated', 'public.meeting_co_editor_grants', 'SELECT,INSERT,UPDATE,DELETE'), 'grants: authenticated holds no table privilege');
SELECT ok(NOT has_table_privilege('anon', 'public.meeting_co_editor_grants', 'SELECT,INSERT,UPDATE,DELETE'), 'grants: anon holds no table privilege');
SELECT ok(NOT has_function_privilege('anon', 'public.can_edit_meeting_verified(uuid,uuid)', 'EXECUTE'), 'anon cannot execute can_edit_meeting_verified');

-- ---------------------------------------------------------------------------
-- 2. D1 — verified editors save and read back (14)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('editor');
SELECT lives_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e1', 'Acuerdo del editor')$$, t),
  format('D1 %s: creator INSERT succeeds', t)) FROM child_tables ORDER BY t;
SELECT results_eq($$SELECT agreement_text FROM public.meeting_agreements WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e1' ORDER BY agreement_text$$,
  ARRAY['Acuerdo del editor', 'seed'], 'D1 agreements: creator reads back exactly the meeting rows');
SELECT results_eq($$SELECT task_title FROM public.meeting_tasks WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e1' ORDER BY task_title$$,
  ARRAY['Acuerdo del editor', 'seed'], 'D1 tasks: creator reads back exactly the meeting rows');
SELECT is(pg_temp.upd(t, '5e220000-0000-4000-8000-0000000000e1'), 2, format('D1 %s: creator UPDATE reaches both rows', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e1'), 2, format('D1 %s: facilitator reads', t)) FROM child_tables ORDER BY t;
SELECT lives_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e1', 'facilitador')$$, t),
  format('D1 %s: facilitator INSERT succeeds', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.as_user('leader');
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e1'), 3, format('D1 %s: active lider_comunidad reads', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e3'), 0, format('D1 %s: lider_comunidad of A reads nothing in B', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 3. D2 — outsider and read-only member cannot self-assign or reach children
--    (2 actors x (2 self-assign + 1 verified + 2 tables x 5) = 26)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE d2_actors (p text) ON COMMIT DROP;
INSERT INTO d2_actors VALUES ('outsider'), ('member');
GRANT SELECT ON d2_actors TO authenticated;

SELECT pg_temp.as_user('outsider');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', auth.uid(), 'co_editor')$$,
  '42501', NULL, 'D2 outsider: self-assigning co_editor on A1 is denied');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e3', auth.uid(), 'co_editor')$$,
  '42501', NULL, 'D2 outsider: self-assigning co_editor on B1 (cross-tenant) is denied');
SELECT pg_temp.as_user('member');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', auth.uid(), 'co_editor')$$,
  '42501', NULL, 'D2 read-only member: self-assigning co_editor on own-community A1 is denied');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e3', auth.uid(), 'co_editor')$$,
  '42501', NULL, 'D2 read-only member: self-assigning co_editor on B1 (cross-tenant) is denied');
SELECT pg_temp.reset_auth();

-- Each actor x table x action, run under that actor.
CREATE OR REPLACE FUNCTION pg_temp.d2_matrix(p text) RETURNS SETOF text AS $$
DECLARE t text; m text;
BEGIN
  PERFORM pg_temp.as_user(p);
  RETURN NEXT ok(NOT public.can_edit_meeting_verified(auth.uid(), '5e220000-0000-4000-8000-0000000000e1'), format('D2 %s: not a verified editor of A1', p));
  FOR t IN SELECT c.t FROM child_tables c ORDER BY c.t LOOP
    FOREACH m IN ARRAY ARRAY['5e220000-0000-4000-8000-0000000000e1', '5e220000-0000-4000-8000-0000000000e3'] LOOP
      RETURN NEXT is(pg_temp.visible(t, m::uuid), 0, format('D2 %s %s: SELECT on %s yields no row', p, t, right(m, 2)));
      RETURN NEXT throws_ok(format($q$SELECT pg_temp.ins(%L, %L, 'intruso')$q$, t, m), '42501', NULL, format('D2 %s %s: INSERT into %s denied', p, t, right(m, 2)));
    END LOOP;
    RETURN NEXT is(pg_temp.upd(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D2 %s %s: UPDATE changes no row', p, t));
  END LOOP;
  PERFORM pg_temp.reset_auth();
END;
$$ LANGUAGE plpgsql;
SELECT pg_temp.d2_matrix(p) FROM d2_actors ORDER BY p;

-- ---------------------------------------------------------------------------
-- 4. D3 — provenance (25)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('legacy');
SELECT ok(public.can_edit_meeting(auth.uid(), '5e220000-0000-4000-8000-0000000000e1'), 'D3 legacy: baseline can_edit_meeting still trusts the old row (unchanged function)');
SELECT ok(NOT public.can_edit_meeting_verified(auth.uid(), '5e220000-0000-4000-8000-0000000000e1'), 'D3 legacy: the old row is not a verified grant');
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D3 legacy %s: SELECT yields no row', t)) FROM child_tables ORDER BY t;
SELECT throws_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e1', 'legado')$$, t), '42501', NULL,
  format('D3 legacy %s: INSERT denied', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.upd(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D3 legacy %s: UPDATE with WHERE changes no row', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.upd_all(t), 0, format('D3 legacy %s: UPDATE without WHERE changes no row', t)) FROM child_tables ORDER BY t;
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', pg_temp.uid('member'), 'co_editor')$$,
  '42501', NULL, 'D3 legacy: cannot grant co_editor to someone else');
SELECT pg_temp.reset_auth();

-- Ordinary attendee inserts keep working for any signed-in user.
SELECT pg_temp.as_user('outsider');
SELECT lives_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', auth.uid(), 'participant')$$,
  'D3 outsider: ordinary participant insert still works');
UPDATE public.meeting_attendees SET role = 'co_editor' WHERE user_id = auth.uid();
SELECT pg_temp.reset_auth();
SELECT is((SELECT role FROM public.meeting_attendees WHERE user_id = pg_temp.uid('outsider')), 'participant',
  'D3 outsider: promoting own participant row to co_editor changes nothing');
SELECT pg_temp.as_user('legacy');
SELECT throws_ok($$UPDATE public.meeting_attendees SET role = 'co_editor' WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e1' AND user_id = pg_temp.uid('outsider')$$,
  '42501', NULL, 'D3 legacy: cannot promote another attendee to co_editor');
SELECT pg_temp.as_user('editor');
SELECT lives_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', pg_temp.uid('member'), 'participant')$$,
  'D3 editor: ordinary participant insert for another user still works');
SELECT lives_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', pg_temp.uid('grantee'), 'co_editor')$$,
  'D3 editor: a verified editor grants co_editor');
SELECT pg_temp.reset_auth();
SELECT results_eq($$SELECT user_id, granted_by FROM public.meeting_co_editor_grants WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e1'$$,
  $$VALUES (pg_temp.uid('grantee'), pg_temp.uid('editor'))$$,
  'D3: exactly one provenance row, for the verified grant, naming its grantor');

SELECT pg_temp.as_user('grantee');
SELECT ok(public.can_edit_meeting_verified(auth.uid(), '5e220000-0000-4000-8000-0000000000e1'), 'D3 grantee: verified editor of A1');
SELECT lives_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e1', 'coeditor')$$, t),
  format('D3 grantee %s: INSERT succeeds', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e1'), 4, format('D3 grantee %s: reads the meeting rows', t)) FROM child_tables ORDER BY t;
SELECT throws_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e3', 'coeditor')$$, t), '42501', NULL,
  format('D3 grantee %s: the grant does not reach B1', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.as_user('editor');
UPDATE public.meeting_attendees SET role = 'participant'
 WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e1' AND user_id = pg_temp.uid('grantee');
SELECT pg_temp.as_user('grantee');
SELECT is(pg_temp.visible('meeting_agreements', '5e220000-0000-4000-8000-0000000000e1'), 0, 'D3 grantee: demotion removes child access');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 5. D4 — regression matrix (anon, inactive, wrong meeting, NULL, move,
--    UPDATE / DELETE) (45)
-- ---------------------------------------------------------------------------
SELECT pg_temp.set_anon();
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D4 anon %s: SELECT yields no row', t)) FROM child_tables ORDER BY t;
SELECT throws_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e1', 'anon')$$, t), '42501', NULL,
  format('D4 anon %s: INSERT denied', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.upd(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D4 anon %s: UPDATE changes no row', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D4 anon %s: DELETE removes no row', t)) FROM child_tables ORDER BY t;
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e220000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), 'co_editor')$$,
  '42501', NULL, 'D4 anon: cannot write a co_editor row');
SELECT pg_temp.reset_auth();

SELECT pg_temp.as_user('inactive');
SELECT ok(NOT public.can_edit_meeting_verified(auth.uid(), '5e220000-0000-4000-8000-0000000000e1'), 'D4 inactive lider_comunidad: not a verified editor');
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D4 inactive %s: SELECT yields no row', t)) FROM child_tables ORDER BY t;
SELECT throws_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e1', 'inactivo')$$, t), '42501', NULL,
  format('D4 inactive %s: INSERT denied', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.upd(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D4 inactive %s: UPDATE changes no row', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e1'), 0, format('D4 inactive %s: DELETE removes no row', t)) FROM child_tables ORDER BY t;

SELECT pg_temp.as_user('editor');
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e3'), 0, format('D4 wrong meeting %s: editor of A reads nothing in B1', t)) FROM child_tables ORDER BY t;
SELECT throws_ok(format($$SELECT pg_temp.ins(%L, '5e220000-0000-4000-8000-0000000000e3', 'otro')$$, t), '42501', NULL,
  format('D4 wrong meeting %s: editor of A cannot insert into B1', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.upd(t, '5e220000-0000-4000-8000-0000000000e3'), 0, format('D4 wrong meeting %s: editor of A updates nothing in B1', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e3'), 0, format('D4 wrong meeting %s: editor of A deletes nothing in B1', t)) FROM child_tables ORDER BY t;
SELECT ok(NOT public.can_edit_meeting_verified(auth.uid(), NULL), 'D4 NULL meeting id: never a verified editor');
SELECT throws_ok(format($$SELECT pg_temp.ins(%L, NULL, 'nulo')$$, t), '42501', NULL,
  format('D4 NULL meeting id %s: INSERT fails', t)) FROM child_tables ORDER BY t;
SELECT throws_ok(format($$SELECT pg_temp.move(%L, '5e220000-0000-4000-8000-0000000000e1', '5e220000-0000-4000-8000-0000000000e3')$$, t), '42501', NULL,
  format('D4 move %s: editor cannot move A1 rows into B1', t)) FROM child_tables ORDER BY t;
SELECT lives_ok(format($$SELECT pg_temp.move(%L, '5e220000-0000-4000-8000-0000000000e1', '5e220000-0000-4000-8000-0000000000e2')$$, t),
  format('D4 move %s: editor may move rows between meetings it edits (baseline)', t)) FROM child_tables ORDER BY t;
SELECT is(pg_temp.visible(t, '5e220000-0000-4000-8000-0000000000e2'), 4, format('D4 move %s: moved rows land in A2', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.reset_auth();

-- DELETE keeps its baseline meaning: creator / admin / lider_comunidad only.
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e2'), 0, format('D4 facilitator %s: DELETE removes no row (baseline)', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.as_user('outsider');
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e2'), 0, format('D4 outsider %s: DELETE removes no row', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.as_user('legacy');
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e2'), 0, format('D4 legacy %s: DELETE removes no row', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.as_user('editor');
SELECT is(pg_temp.del(t, '5e220000-0000-4000-8000-0000000000e2'), 4, format('D4 creator %s: DELETE removes the rows', t)) FROM child_tables ORDER BY t;
SELECT pg_temp.reset_auth();
SELECT is((SELECT count(*)::int FROM public.meeting_agreements WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e3')
        + (SELECT count(*)::int FROM public.meeting_tasks WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e3'), 2,
  'D4: B1 rows are intact after every cross-tenant attempt');
SELECT is((SELECT count(*)::int FROM public.meeting_agreements WHERE meeting_id = '5e220000-0000-4000-8000-0000000000e3' AND agreement_text = 'seed'), 1,
  'D4: B1 agreement text unchanged');

SELECT * FROM finish();
ROLLBACK;
