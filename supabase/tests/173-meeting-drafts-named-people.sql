-- =============================================================================
-- 173-meeting-drafts-named-people.sql — GENERA fixes F25, build B, item
-- EC-R16: migration 20261125101000_meeting_drafts_named_people.sql.
--
-- Owner rule (17 Nov 2026, widened 20 Nov 2026): a draft meeting (status
-- 'borrador') is seen — its row, its content and its attendee list — only by
-- its creator, its facilitator, its secretary, a person with a co_editor row on
-- it (with or without provenance), an active admin and an active leader of the
-- meeting's community. Editing a draft stays as before for those people; a
-- consultor edits a draft only when named on it. Meetings in any other state
-- are read and edited exactly as before.
--
--   0. catalog: the new helper and the new restrictive SELECT policy
--   1. fixtures sanity: the verified co-editor has provenance, the legacy one not
--   2. every person x every meeting, each with their own session:
--        sees the meeting row, sees its agreement, sees its attendee rows,
--        can update its title (rows affected)
--   3. the creator inserts a draft with RETURNING in one statement
--   4. the assignee of a draft's commitment still sees that commitment
--   5. the service role sees and updates every meeting
--   6. turning a meeting of another state into a draft (lead, 25 Nov 2026): an
--      un-named consultor is refused (the row stays as it was) but still edits
--      the meeting otherwise; a named consultor turns it into a draft and
--      still sees it
--
-- Invented people and data only. Synthetic/local state only. Rolls back.
-- DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(226);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated, service_role;
CREATE TEMP TABLE mt (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON mt TO anon, authenticated, service_role;
-- Expected outcome per person and meeting: sees the row (0/1), sees its
-- agreement (0/1), number of attendee rows seen, title update rows affected.
CREATE TEMP TABLE ex (p text, k text, sees int, agr int, att int, upd int, PRIMARY KEY (p, k)) ON COMMIT DROP;
GRANT SELECT ON ex TO anon, authenticated, service_role;

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
  PERFORM tests.authenticate_as('f25b_' || p);
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

-- The 16 checks of one person on the four meetings D, E, P, C. Called after the
-- caller has switched to that person's session, so row level security decides.
CREATE OR REPLACE FUNCTION pg_temp.person_checks(person text) RETURNS SETOF text AS $$
DECLARE
  e record;
  m uuid;
BEGIN
  FOR e IN SELECT * FROM ex WHERE ex.p = person ORDER BY array_position(ARRAY['D', 'E', 'P', 'C'], ex.k) LOOP
    m := pg_temp.mid(e.k);
    RETURN NEXT is(
      (SELECT count(*)::int FROM public.community_meetings WHERE id = m),
      e.sees, format('%s x %s: sees the meeting row = %s', person, e.k, e.sees));
    RETURN NEXT is(
      (SELECT count(*)::int FROM public.meeting_agreements WHERE meeting_id = m),
      e.agr, format('%s x %s: sees its agreement = %s', person, e.k, e.agr));
    RETURN NEXT is(
      (SELECT count(*)::int FROM public.meeting_attendees WHERE meeting_id = m),
      e.att, format('%s x %s: sees its attendee rows = %s', person, e.k, e.att));
    RETURN NEXT is(
      pg_temp.exec_count(format('UPDATE public.community_meetings SET title = title || %L WHERE id = %L', '!', m)),
      e.upd, format('%s x %s: title update rows affected = %s', person, e.k, e.upd));
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres: auth.uid() is NULL, so no guard applies).
-- One community and workspace, plus another community for the outsider.
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('f25b_' || p, 'f25b-' || replace(p, '_', '-') || '@example.test')
FROM unnest(ARRAY['creator', 'facilitator', 'secretary', 'coeditor_verified', 'coeditor_legacy', 'participant',
                  'reader', 'member', 'leader', 'admin', 'consultor', 'consultor_named', 'outsider']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, name) VALUES
  ('25b00000-0000-4000-8000-0000000000c1', 'F25B Comunidad'),
  ('25b00000-0000-4000-8000-0000000000c2', 'F25B Otra comunidad');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('25b00000-0000-4000-8000-0000000000a1', '25b00000-0000-4000-8000-0000000000c1');
INSERT INTO public.user_roles (user_id, role_type, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, c::uuid, true FROM (VALUES
  ('creator', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('facilitator', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('secretary', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('coeditor_verified', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('coeditor_legacy', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('participant', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('reader', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('member', 'docente', '25b00000-0000-4000-8000-0000000000c1'),
  ('leader', 'lider_comunidad', '25b00000-0000-4000-8000-0000000000c1'),
  ('admin', 'admin', NULL),
  ('consultor', 'consultor', NULL),
  ('consultor_named', 'consultor', NULL),
  ('outsider', 'docente', '25b00000-0000-4000-8000-0000000000c2')) v(p, r, c);

-- D: draft with facilitator and secretary; E: draft whose facilitator is a
-- consultor; P: programada; C: completada and finalised. All by `creator`.
INSERT INTO mt (k, id) SELECT k, gen_random_uuid() FROM unnest(ARRAY['D', 'E', 'P', 'C']) k;
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by, status, facilitator_id, secretary_id)
SELECT pg_temp.mid(k), '25b00000-0000-4000-8000-0000000000a1', 'F25B ' || k, now() + interval '1 day', pg_temp.uid('creator'),
       s::meeting_status, f, sec
FROM (VALUES
  ('D', 'borrador', pg_temp.uid('facilitator'), pg_temp.uid('secretary')),
  ('E', 'borrador', pg_temp.uid('consultor_named'), NULL::uuid),
  ('P', 'programada', NULL::uuid, NULL::uuid),
  ('C', 'completada', NULL::uuid, NULL::uuid)) v(k, s, f, sec);
UPDATE public.community_meetings
   SET finalized_at = '2026-11-10 12:00:00+00', finalized_by = pg_temp.uid('creator'),
       finalize_audience = 'community', finalize_with_access = true
 WHERE id = pg_temp.mid('C');
INSERT INTO public.meeting_agreements (meeting_id, agreement_text)
SELECT id, 'Acuerdo sintético ' || k FROM mt;
INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to)
SELECT id, 'Compromiso sintético ' || k, pg_temp.uid('participant') FROM mt;
-- A plain participant on every meeting; the legacy co-editor row on D without
-- provenance (inserted as postgres, so the trigger records nothing).
INSERT INTO public.meeting_attendees (meeting_id, user_id, role)
SELECT id, pg_temp.uid('participant'), 'participant' FROM mt;
INSERT INTO public.meeting_attendees (meeting_id, user_id, role)
VALUES (pg_temp.mid('D'), pg_temp.uid('coeditor_legacy'), 'co_editor');
-- Read grants for `reader` on D, P and C.
INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by)
SELECT pg_temp.mid(k), pg_temp.uid('reader'), pg_temp.uid('creator') FROM unnest(ARRAY['D', 'P', 'C']) k;
-- The verified co-editor row on D, inserted AS the creator so the provenance
-- trigger records it.
SELECT pg_temp.as_user('creator');
INSERT INTO public.meeting_attendees (meeting_id, user_id, role)
VALUES (pg_temp.mid('D'), pg_temp.uid('coeditor_verified'), 'co_editor');
SELECT pg_temp.reset_auth();

-- Expectations (after the fix). D has 3 attendee rows (participant and the two
-- co-editors), E, P and C one each (participant).
INSERT INTO ex (p, k, sees, agr, att, upd) VALUES
  ('creator', 'D', 1, 1, 3, 1), ('creator', 'E', 1, 1, 1, 1), ('creator', 'P', 1, 1, 1, 1), ('creator', 'C', 1, 1, 1, 1),
  ('facilitator', 'D', 1, 1, 3, 1), ('facilitator', 'E', 0, 0, 0, 0), ('facilitator', 'P', 1, 0, 1, 0), ('facilitator', 'C', 1, 0, 1, 0),
  ('secretary', 'D', 1, 1, 3, 1), ('secretary', 'E', 0, 0, 0, 0), ('secretary', 'P', 1, 0, 1, 0), ('secretary', 'C', 1, 0, 1, 0),
  ('coeditor_verified', 'D', 1, 1, 3, 1), ('coeditor_verified', 'E', 0, 0, 0, 0), ('coeditor_verified', 'P', 1, 0, 1, 0), ('coeditor_verified', 'C', 1, 0, 1, 0),
  -- the legacy co-editor sees the draft (tests/e2e/meeting-agreements-tasks.spec.ts:461-478) but does not edit it
  ('coeditor_legacy', 'D', 1, 1, 3, 0), ('coeditor_legacy', 'E', 0, 0, 0, 0), ('coeditor_legacy', 'P', 1, 0, 1, 0), ('coeditor_legacy', 'C', 1, 0, 1, 0),
  ('participant', 'D', 0, 0, 0, 0), ('participant', 'E', 0, 0, 0, 0), ('participant', 'P', 1, 1, 1, 0), ('participant', 'C', 1, 1, 1, 0),
  ('reader', 'D', 0, 0, 0, 0), ('reader', 'E', 0, 0, 0, 0), ('reader', 'P', 1, 1, 1, 0), ('reader', 'C', 1, 1, 1, 0),
  ('member', 'D', 0, 0, 0, 0), ('member', 'E', 0, 0, 0, 0), ('member', 'P', 1, 0, 1, 0), ('member', 'C', 1, 0, 1, 0),
  ('leader', 'D', 1, 1, 3, 1), ('leader', 'E', 1, 1, 1, 1), ('leader', 'P', 1, 1, 1, 1), ('leader', 'C', 1, 1, 1, 1),
  ('admin', 'D', 1, 1, 3, 1), ('admin', 'E', 1, 1, 1, 1), ('admin', 'P', 1, 1, 1, 1), ('admin', 'C', 1, 1, 1, 1),
  ('consultor', 'D', 0, 0, 0, 0), ('consultor', 'E', 0, 0, 0, 0), ('consultor', 'P', 1, 1, 1, 1), ('consultor', 'C', 1, 1, 1, 1),
  ('consultor_named', 'D', 0, 0, 0, 0), ('consultor_named', 'E', 1, 1, 1, 1), ('consultor_named', 'P', 1, 1, 1, 1), ('consultor_named', 'C', 1, 1, 1, 1),
  ('outsider', 'D', 0, 0, 0, 0), ('outsider', 'E', 0, 0, 0, 0), ('outsider', 'P', 0, 0, 0, 0), ('outsider', 'C', 0, 0, 0, 0);

-- ---------------------------------------------------------------------------
-- 0. Catalog (4)
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
   WHERE p.proname = 'can_see_meeting_draft' AND p.pronamespace = 'public'::regnamespace
     AND pg_get_function_identity_arguments(p.oid) = 'check_user_id uuid, check_meeting_id uuid'
     AND p.prosecdef AND p.provolatile = 's' AND p.proconfig @> ARRAY['search_path=public, pg_temp']),
  'can_see_meeting_draft(uuid, uuid) is STABLE SECURITY DEFINER with a pinned search_path');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
   WHERE p.proname = 'can_see_meeting_draft' AND p.pronamespace = 'public'::regnamespace
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')),
  'can_see_meeting_draft is not executable by anon');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_proc p
   WHERE p.proname = 'can_see_meeting_draft' AND p.pronamespace = 'public'::regnamespace
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE')),
  'can_see_meeting_draft is executable by authenticated and service_role');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_policy
   WHERE polrelid = 'public.community_meetings'::regclass
     AND polname = 'Drafts are seen only by the people named on them'
     AND polcmd = 'r' AND NOT polpermissive),
  'community_meetings has the restrictive SELECT policy on drafts');

-- ---------------------------------------------------------------------------
-- 1. Fixtures sanity (2)
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.meeting_co_editor_grants WHERE meeting_id = pg_temp.mid('D') AND user_id = pg_temp.uid('coeditor_verified')),
  1, 'fixture: the verified co-editor row of D has provenance');
SELECT is((SELECT count(*)::int FROM public.meeting_co_editor_grants WHERE meeting_id = pg_temp.mid('D') AND user_id = pg_temp.uid('coeditor_legacy')),
  0, 'fixture: the legacy co-editor row of D has no provenance');

-- ---------------------------------------------------------------------------
-- 2. Every person x every meeting (13 x 4 x 4 = 208)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');           SELECT * FROM pg_temp.person_checks('creator');
SELECT pg_temp.as_user('facilitator');       SELECT * FROM pg_temp.person_checks('facilitator');
SELECT pg_temp.as_user('secretary');         SELECT * FROM pg_temp.person_checks('secretary');
SELECT pg_temp.as_user('coeditor_verified'); SELECT * FROM pg_temp.person_checks('coeditor_verified');
SELECT pg_temp.as_user('coeditor_legacy');   SELECT * FROM pg_temp.person_checks('coeditor_legacy');
SELECT pg_temp.as_user('participant');       SELECT * FROM pg_temp.person_checks('participant');
SELECT pg_temp.as_user('reader');            SELECT * FROM pg_temp.person_checks('reader');
SELECT pg_temp.as_user('member');            SELECT * FROM pg_temp.person_checks('member');
SELECT pg_temp.as_user('leader');            SELECT * FROM pg_temp.person_checks('leader');
SELECT pg_temp.as_user('admin');             SELECT * FROM pg_temp.person_checks('admin');
SELECT pg_temp.as_user('consultor');         SELECT * FROM pg_temp.person_checks('consultor');
SELECT pg_temp.as_user('consultor_named');   SELECT * FROM pg_temp.person_checks('consultor_named');
SELECT pg_temp.as_user('outsider');          SELECT * FROM pg_temp.person_checks('outsider');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 3. The creator inserts a draft and gets its id back in one statement, as the
--    application's .insert(...).select() does (2)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');
SELECT is(
  pg_temp.exec_count(format(
    'INSERT INTO public.community_meetings (workspace_id, title, meeting_date, created_by, status) VALUES (%L, %L, now() + interval %L, auth.uid(), %L) RETURNING id',
    '25b00000-0000-4000-8000-0000000000a1', 'F25B nuevo borrador', '2 days', 'borrador')),
  1, 'creator: INSERT ... RETURNING of a new draft returns one row');
SELECT is((SELECT count(*)::int FROM public.community_meetings WHERE title = 'F25B nuevo borrador'),
  1, 'creator: sees the new draft at once');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 4. Unchanged on purpose (open question for Brent): the assignee of a draft's
--    commitment still sees that one commitment (20261003100000:300) (1)
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('participant');
SELECT is((SELECT count(*)::int FROM public.meeting_commitments WHERE meeting_id = pg_temp.mid('D')),
  1, 'participant: still sees the commitment assigned to her on draft D (assignee branch unchanged)');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 5. The service role sees and updates every meeting (2)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*)::int FROM public.community_meetings WHERE workspace_id = '25b00000-0000-4000-8000-0000000000a1'),
  5, 'service role: sees every meeting of the workspace, drafts included');
SELECT is(
  pg_temp.exec_count(format('UPDATE public.community_meetings SET title = title || %L WHERE workspace_id = %L', '.', '25b00000-0000-4000-8000-0000000000a1')),
  5, 'service role: updates every meeting of the workspace');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 6. Turning a meeting into a draft (7). Decided by the lead (25 Nov 2026): a
--    person who would not see the draft cannot turn a meeting of another state
--    into one; the database refuses it (row level security on the new row).
--    Q: programada, by creator, secretary = consultor_named.
-- ---------------------------------------------------------------------------
INSERT INTO mt (k, id) VALUES ('Q', gen_random_uuid());
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by, status, secretary_id)
VALUES (pg_temp.mid('Q'), '25b00000-0000-4000-8000-0000000000a1', 'F25B Q', now() + interval '1 day', pg_temp.uid('creator'),
        'programada', pg_temp.uid('consultor_named'));
SELECT pg_temp.as_user('consultor');
SELECT throws_ok(
  format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'borrador', pg_temp.mid('Q')),
  '42501', NULL, 'consultor (not named): cannot turn a programada meeting into a draft');
SELECT pg_temp.as_user('admin');
SELECT is((SELECT status::text || '|' || title FROM public.community_meetings WHERE id = pg_temp.mid('Q')),
  'programada|F25B Q', 'admin: after the refusal the meeting is unchanged (programada, same title)');
SELECT pg_temp.as_user('consultor');
SELECT is(pg_temp.exec_count(format('UPDATE public.community_meetings SET title = title || %L WHERE id = %L', ' (editada)', pg_temp.mid('Q'))),
  1, 'consultor (not named): still edits the title of the programada meeting');
SELECT is(pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'en_progreso', pg_temp.mid('Q'))),
  1, 'consultor (not named): still changes it to another state that is not a draft');
SELECT pg_temp.as_user('consultor_named');
SELECT is(pg_temp.exec_count(format('UPDATE public.community_meetings SET status = %L WHERE id = %L', 'borrador', pg_temp.mid('Q'))),
  1, 'consultor_named (secretary): turns the meeting into a draft');
SELECT is((SELECT status::text FROM public.community_meetings WHERE id = pg_temp.mid('Q')),
  'borrador', 'consultor_named (secretary): still sees it, now a draft');
SELECT pg_temp.as_user('consultor');
SELECT is((SELECT count(*)::int FROM public.community_meetings WHERE id = pg_temp.mid('Q')),
  0, 'consultor (not named): no longer sees it once it is a draft');
SELECT pg_temp.reset_auth();

SELECT * FROM finish();
ROLLBACK;
