-- =============================================================================
-- 011-zoom-public-rls.sql — Z1b: session_meetings_public persona matrix
--
-- §7 RLS matrix row for the projection table (010-style):
--   admin            → SELECT all rows
--   consultor        → SELECT own school only
--   GC member        → SELECT own community only, is_active required
--   other-school     → nothing (of the other school's rows)
--   anon             → nothing
--   any authenticated INSERT/UPDATE/DELETE → blocked (no write policies;
--   writes are service-role only). Blocked INSERT throws (42501); blocked
--   UPDATE/DELETE return empty — asserted accordingly.
--
-- Fixtures are synthetic (@test.local via tests.create_supabase_user) and the
-- whole file rolls back. This suite grows per phase as later Zoom public
-- tables land (PM ruling — Z1b ships only session_meetings_public).
--
-- Z2-1 appends the column shape of `consultor_sessions.is_zoom_managed` (plan §8
-- durable managed intent). It lives here rather than in 010 because 010 owns the
-- consultor_sessions PERSONA matrix and this is a Zoom schema assertion; the
-- default in particular is load-bearing — every pre-existing session must read
-- as unmanaged, or the provisioner's eligibility gate would open on rows nobody
-- marked.
-- =============================================================================

BEGIN;

SELECT plan(51);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('z_admin');
SELECT tests.create_supabase_user('z_cons_a');
SELECT tests.create_supabase_user('z_cons_b');
SELECT tests.create_supabase_user('z_gc_mem');
SELECT tests.create_supabase_user('z_gc_off');
SELECT tests.create_supabase_user('z_gc_other');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('z_admin'), ('z_cons_a'), ('z_cons_b'),
             ('z_gc_mem'), ('z_gc_off'), ('z_gc_other')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9901, 'Zoom RLS Test School A'),
  (9902, 'Zoom RLS Test School B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('cccccccc-2222-0000-0000-000000000001', 9901, 'Zoom RLS GC (School A)'),
  ('cccccccc-2222-0000-0000-000000000002', 9902, 'Zoom RLS GC (School B)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (tests.get_supabase_uid('z_admin'),    'admin',     NULL, NULL, true),
  (tests.get_supabase_uid('z_cons_a'),   'consultor', 9901, NULL, true),
  (tests.get_supabase_uid('z_cons_b'),   'consultor', 9902, NULL, true),
  (tests.get_supabase_uid('z_gc_mem'),   'docente',   9901, 'cccccccc-2222-0000-0000-000000000001', true),
  (tests.get_supabase_uid('z_gc_off'),   'docente',   9901, 'cccccccc-2222-0000-0000-000000000001', false),
  (tests.get_supabase_uid('z_gc_other'), 'docente',   9902, 'cccccccc-2222-0000-0000-000000000002', true);

-- Three projection rows: two School A / GC A, one School B / GC B
INSERT INTO public.session_meetings_public
  (id, surface_type, surface_id, school_id, growth_community_id, meeting_status, starts_at, ends_at)
VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000001', 9901,
   'cccccccc-2222-0000-0000-000000000001', 'scheduled',
   now() + interval '1 day', now() + interval '1 day 1 hour'),
  ('ffffffff-0000-0000-0000-000000000002', 'community_meeting',
   'ffffffff-1111-0000-0000-000000000002', 9901,
   'cccccccc-2222-0000-0000-000000000001', 'live',
   now(), now() + interval '1 hour'),
  ('ffffffff-0000-0000-0000-000000000003', 'consultor_session',
   'ffffffff-1111-0000-0000-000000000003', 9902,
   'cccccccc-2222-0000-0000-000000000002', 'scheduled',
   now() + interval '2 days', now() + interval '2 days 1 hour');

-- Sanity: RLS must be enabled or the whole matrix is meaningless
SELECT tests.rls_enabled('public', 'session_meetings_public');

-- -----------------------------------------------------------------------------
-- admin: sees all
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('z_admin');

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002',
                 'ffffffff-0000-0000-0000-000000000003')),
  3, 'admin: sees all 3 seeded projection rows regardless of school');

RESET ROLE;

-- -----------------------------------------------------------------------------
-- consultor: own school only
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('z_cons_a');

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002',
                 'ffffffff-0000-0000-0000-000000000003')),
  2, 'consultor A: sees exactly the 2 rows at their school (School A)');

SELECT is_empty(
  $$ SELECT 1 FROM public.session_meetings_public
      WHERE id = 'ffffffff-0000-0000-0000-000000000003' $$,
  'consultor A: cannot read the School B row');

RESET ROLE;

SELECT tests.authenticate_as('z_cons_b');

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002',
                 'ffffffff-0000-0000-0000-000000000003')),
  1, 'consultor B: sees exactly the 1 row at their school (School B)');

SELECT is_empty(
  $$ SELECT 1 FROM public.session_meetings_public
      WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                   'ffffffff-0000-0000-0000-000000000002') $$,
  'consultor B: cannot read School A rows');

RESET ROLE;

-- -----------------------------------------------------------------------------
-- growth-community member: own community only, is_active required
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('z_gc_mem');

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002',
                 'ffffffff-0000-0000-0000-000000000003')),
  2, 'active GC member: sees exactly the 2 rows of their community (GC A)');

SELECT is_empty(
  $$ SELECT 1 FROM public.session_meetings_public
      WHERE id = 'ffffffff-0000-0000-0000-000000000003' $$,
  'active GC member: cannot read another community''s row');

RESET ROLE;

SELECT tests.authenticate_as('z_gc_off');

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002',
                 'ffffffff-0000-0000-0000-000000000003')),
  0, 'INACTIVE GC member: sees nothing (is_active = false grants no scope)');

RESET ROLE;

SELECT tests.authenticate_as('z_gc_other');

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002')),
  0, 'other-school GC member: sees none of School A''s rows');

RESET ROLE;

-- -----------------------------------------------------------------------------
-- anon: nothing (claims must be cleared — RESET ROLE alone leaves the previous
-- persona's JWT claims set, and auth.uid() reads the claims, not the role)
-- -----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT set_config('role', 'anon', true);

SELECT is(
  (SELECT count(*)::int FROM public.session_meetings_public
    WHERE id IN ('ffffffff-0000-0000-0000-000000000001',
                 'ffffffff-0000-0000-0000-000000000002',
                 'ffffffff-0000-0000-0000-000000000003')),
  0, 'anon: sees nothing');

RESET ROLE;

-- -----------------------------------------------------------------------------
-- Writes: NO policies for authenticated — INSERT throws, UPDATE/DELETE empty.
-- Admin is used as the strongest persona (full SELECT scope), so an empty
-- write result proves the missing write policy, not missing visibility.
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('z_admin');

SELECT throws_ok(
  $$ INSERT INTO public.session_meetings_public
       (surface_type, surface_id, school_id, meeting_status)
     VALUES ('consultor_session', 'ffffffff-9999-0000-0000-000000000001', 9901, 'scheduled') $$,
  '42501',
  NULL,
  'admin (authenticated): INSERT is blocked — writes are service-role only');

SELECT is_empty(
  $$ UPDATE public.session_meetings_public
        SET meeting_status = 'cancelled'
      WHERE id = 'ffffffff-0000-0000-0000-000000000001'
      RETURNING id $$,
  'admin (authenticated): UPDATE matches zero rows — no UPDATE policy exists');

SELECT is_empty(
  $$ DELETE FROM public.session_meetings_public
      WHERE id = 'ffffffff-0000-0000-0000-000000000001'
      RETURNING id $$,
  'admin (authenticated): DELETE matches zero rows — no DELETE policy exists');

RESET ROLE;

SELECT tests.authenticate_as('z_gc_mem');

SELECT throws_ok(
  $$ INSERT INTO public.session_meetings_public
       (surface_type, surface_id, school_id, meeting_status)
     VALUES ('community_meeting', 'ffffffff-9999-0000-0000-000000000002', 9901, 'scheduled') $$,
  '42501',
  NULL,
  'GC member (authenticated): INSERT is blocked — writes are service-role only');

RESET ROLE;

-- -----------------------------------------------------------------------------
-- Z2-1 — consultor_sessions.is_zoom_managed column shape (plan §8)
-- -----------------------------------------------------------------------------

SELECT has_column(
  'public', 'consultor_sessions', 'is_zoom_managed',
  'consultor_sessions.is_zoom_managed exists — durable managed intent (§8)');

SELECT col_not_null(
  'public', 'consultor_sessions', 'is_zoom_managed',
  'consultor_sessions.is_zoom_managed is NOT NULL — intent is never unknown');

SELECT col_default_is(
  'public', 'consultor_sessions', 'is_zoom_managed', false,
  'consultor_sessions.is_zoom_managed defaults to false — every legacy row is unmanaged');

-- =============================================================================
-- Z7-1 — public.zoom_attendance persona matrix and write denial (16 asserts).
--
-- The §7 row is narrower than the projection table's above: admin sees all, the
-- FACILITATOR of that surface sees its rows, and a consultor reaches them ONLY by
-- being that facilitator. No GC member, no other school, no anon — leadership gets
-- API-computed aggregates and never these rows (PROJECT_STATE macro invariant).
--
-- `z_cons_a` is the discriminating persona and it is why this section adds a user:
-- z_fac_a and z_cons_a are BOTH active consultors at School A, and the only thing
-- that separates them is the session_facilitators row. A predicate that leaked
-- school scope into this table would pass every other assert here and fail that one.
--
-- Fixtures stay synthetic (@test.local, Ley 21.719 — attendance rows name real
-- people in production and never in a test).
-- =============================================================================

SELECT tests.create_supabase_user('z_fac_a');

INSERT INTO public.profiles (id, email, name, approval_status)
VALUES (tests.get_supabase_uid('z_fac_a'), 'z_fac_a@test.local', 'z_fac_a', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (tests.get_supabase_uid('z_fac_a'), 'consultor', 9901, NULL, true);

-- Two sessions, one per school. S1 is facilitated by z_fac_a; S2 by nobody.
INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, is_active, created_by)
VALUES
  ('a7a7a7a7-0000-0000-0000-000000000001', 9901,
   'cccccccc-2222-0000-0000-000000000001', 'Z7 RLS Session A', CURRENT_DATE,
   '09:00:00', '10:00:00', 'online', 'programada', true,
   tests.get_supabase_uid('z_admin')),
  ('a7a7a7a7-0000-0000-0000-000000000002', 9902,
   'cccccccc-2222-0000-0000-000000000002', 'Z7 RLS Session B', CURRENT_DATE,
   '11:00:00', '12:00:00', 'online', 'programada', true,
   tests.get_supabase_uid('z_admin'));

INSERT INTO public.session_facilitators (session_id, user_id, facilitator_role, is_lead)
VALUES ('a7a7a7a7-0000-0000-0000-000000000001', tests.get_supabase_uid('z_fac_a'),
        'consultor_externo', true);

-- Three attendance rows: two on School A's session, one on School B's. The second
-- School A row is the `unmatched` shape the §15.3.5 blind spot requires to be
-- storable — a link-join participant Zoom gave no identity field for.
INSERT INTO public.zoom_attendance
  (id, surface_type, surface_id, school_id, zoom_meeting_uuid,
   user_id, customer_key, display_name, transient_email, matched_by,
   joined_at, left_at, source)
VALUES
  ('a7a7a7a7-1111-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/A==',
   tests.get_supabase_uid('z_fac_a'), '47d97a107c8f4c348519b4c77ed439d9', NULL, NULL,
   'customer_key', now() - interval '55 min', now() - interval '5 min', 'webhook'),
  ('a7a7a7a7-1111-0000-0000-000000000002', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/A==',
   NULL, NULL, 'Asistente Sintetico Uno', NULL,
   'unmatched', now() - interval '50 min', NULL, 'webhook'),
  ('a7a7a7a7-1111-0000-0000-000000000003', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000002', 9902, 'z7Synthetic/Occurrence/B==',
   NULL, NULL, NULL, 'z_cons_b@test.local',
   'email', now() - interval '40 min', now() - interval '10 min', 'report');

SELECT tests.rls_enabled('public', 'zoom_attendance');

SELECT col_not_null(
  'public', 'zoom_attendance', 'school_id',
  'zoom_attendance.school_id is NOT NULL — the §6 invariant, every public row is school-scoped');

-- admin: all rows ---------------------------------------------------------------
SELECT tests.authenticate_as('z_admin');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000001',
                 'a7a7a7a7-1111-0000-0000-000000000002',
                 'a7a7a7a7-1111-0000-0000-000000000003')),
  3, 'admin: sees all 3 attendance rows regardless of school');

RESET ROLE;

-- the facilitator of that surface: its rows, and only its rows -------------------
SELECT tests.authenticate_as('z_fac_a');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000001',
                 'a7a7a7a7-1111-0000-0000-000000000002',
                 'a7a7a7a7-1111-0000-0000-000000000003')),
  2, 'facilitator: sees exactly the 2 rows of the session they facilitate');

SELECT is_empty(
  $$ SELECT 1 FROM public.zoom_attendance
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000003' $$,
  'facilitator: cannot read another session''s attendance');

RESET ROLE;

-- consultor at the SAME school who is not the facilitator: nothing ---------------
SELECT tests.authenticate_as('z_cons_a');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000001',
                 'a7a7a7a7-1111-0000-0000-000000000002',
                 'a7a7a7a7-1111-0000-0000-000000000003')),
  0, 'consultor A (School A, NOT the facilitator): sees nothing — school scope grants nothing here');

RESET ROLE;

-- another school: nothing --------------------------------------------------------
SELECT tests.authenticate_as('z_cons_b');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000001',
                 'a7a7a7a7-1111-0000-0000-000000000002',
                 'a7a7a7a7-1111-0000-0000-000000000003')),
  0, 'consultor B (School B): sees nothing, including their own school''s row');

RESET ROLE;

-- GC member: nothing (unlike the projection table, which they DO read) -----------
SELECT tests.authenticate_as('z_gc_mem');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000001',
                 'a7a7a7a7-1111-0000-0000-000000000002',
                 'a7a7a7a7-1111-0000-0000-000000000003')),
  0, 'active GC member: sees no attendance rows — this table is not community-readable');

RESET ROLE;

-- anon: nothing ------------------------------------------------------------------
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT set_config('role', 'anon', true);

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000001',
                 'a7a7a7a7-1111-0000-0000-000000000002',
                 'a7a7a7a7-1111-0000-0000-000000000003')),
  0, 'anon: sees no attendance rows');

RESET ROLE;

-- Writes: no policy for ANY role. Asserted from both personas that CAN read, so an
-- empty result proves the missing write policy rather than missing visibility.
SELECT tests.authenticate_as('z_admin');

SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid, matched_by, joined_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/A==', 'unmatched', now(), 'webhook') $$,
  '42501',
  NULL,
  'admin (authenticated): INSERT is blocked — attendance writes are service-role only');

SELECT is_empty(
  $$ UPDATE public.zoom_attendance
        SET matched_by = 'name'
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000001'
      RETURNING id $$,
  'admin (authenticated): UPDATE matches zero rows — no UPDATE policy exists');

SELECT is_empty(
  $$ DELETE FROM public.zoom_attendance
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000001'
      RETURNING id $$,
  'admin (authenticated): DELETE matches zero rows — no DELETE policy exists');

RESET ROLE;

SELECT tests.authenticate_as('z_fac_a');

SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid, matched_by, joined_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/A==', 'unmatched', now(), 'webhook') $$,
  '42501',
  NULL,
  'facilitator: INSERT is blocked — reading their own session grants no write');

SELECT is_empty(
  $$ UPDATE public.zoom_attendance
        SET display_name = 'edited'
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000001'
      RETURNING id $$,
  'facilitator: UPDATE matches zero rows even on a row they can SELECT');

SELECT is_empty(
  $$ DELETE FROM public.zoom_attendance
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000002'
      RETURNING id $$,
  'facilitator: DELETE matches zero rows even on a row they can SELECT');

RESET ROLE;

-- ...and the same claim structurally, so a future write policy fails HERE rather
-- than only in whichever persona happened to be enumerated above.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'zoom_attendance' AND cmd <> 'SELECT'),
  0, 'zoom_attendance carries no non-SELECT policy for any role (§7 frozen decision)');

-- =============================================================================
-- Z7-1 — the C6 amendment: zoom_internal.zoom_meetings.actual_* (12 asserts).
--
-- The columns are the storage §11 quantity (3) never had. They live in the private
-- schema, so the §6 lockdown must still hold after the migration — a new column is
-- exactly the kind of change that can quietly inherit a grant.
-- =============================================================================

SELECT has_column('zoom_internal', 'zoom_meetings', 'actual_started_at',
  'zoom_meetings.actual_started_at exists — §11 quantity (3) has storage');
SELECT has_column('zoom_internal', 'zoom_meetings', 'actual_ended_at',
  'zoom_meetings.actual_ended_at exists');

SELECT col_type_is('zoom_internal', 'zoom_meetings', 'actual_started_at',
  'timestamp with time zone',
  'actual_started_at is timestamptz — instants are UTC (§10)');
SELECT col_type_is('zoom_internal', 'zoom_meetings', 'actual_ended_at',
  'timestamp with time zone',
  'actual_ended_at is timestamptz');

SELECT col_is_null('zoom_internal', 'zoom_meetings', 'actual_started_at',
  'actual_started_at is nullable — provisioning never writes it, and every pre-Z7 row reads NULL');
SELECT col_is_null('zoom_internal', 'zoom_meetings', 'actual_ended_at',
  'actual_ended_at is nullable');

SELECT is(has_column_privilege('anon',
  'zoom_internal.zoom_meetings', 'actual_started_at', 'SELECT'), false,
  'anon cannot read zoom_meetings.actual_started_at');
SELECT is(has_column_privilege('authenticated',
  'zoom_internal.zoom_meetings', 'actual_started_at', 'SELECT'), false,
  'authenticated cannot read zoom_meetings.actual_started_at');
SELECT is(has_column_privilege('anon',
  'zoom_internal.zoom_meetings', 'actual_ended_at', 'SELECT'), false,
  'anon cannot read zoom_meetings.actual_ended_at');
SELECT is(has_column_privilege('authenticated',
  'zoom_internal.zoom_meetings', 'actual_ended_at', 'SELECT'), false,
  'authenticated cannot read zoom_meetings.actual_ended_at');

SELECT is(has_schema_privilege('authenticated', 'zoom_internal', 'USAGE'), false,
  'the §6 lockdown survives the Z7-1 migration — authenticated still has no USAGE on zoom_internal');
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema = 'zoom_internal' AND grantee = 'authenticated'),
  0, 'the §6 lockdown survives the Z7-1 migration — still zero table grants for authenticated');

-- =============================================================================
-- Z7-1 — the instants are WRITE-ONCE, enforced in SQL (5 asserts).
--
-- `webhook_sweep` replays events fifteen minutes or more after they arrive and Zoom
-- does not order its deliveries, so a second `meeting.started` for the same
-- occurrence is normal operation, not a fault. The writer is PostgREST, which sends
-- literal values and cannot express COALESCE in its SET list — so the rule is a
-- BEFORE UPDATE trigger and holds for every writer, including ones that do not exist
-- yet. This is the database half of [A6]; the out-of-order half (an `ended` followed
-- by a swept `started`, refused by the status guard) is asserted in
-- `__tests__/lib/zoom/webhook-lifecycle-instants.test.ts`.
--
-- host_zoom_user_id is NULL so this fixture cannot collide with the §9 EXCLUDE
-- reservation.
-- =============================================================================

INSERT INTO zoom_internal.zoom_meetings
  (id, surface_type, surface_id, school_id, host_zoom_user_id, zoom_meeting_number,
   status, starts_at, duration_minutes)
VALUES
  ('a7a7a7a7-2222-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-3333-0000-0000-000000000001', 9901, NULL, 86084701483,
   'provisioned', '2026-07-29T23:30:00Z', 60);

UPDATE zoom_internal.zoom_meetings
   SET status = 'started', actual_started_at = '2026-07-29T23:55:56Z'
 WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001';

SELECT is(
  (SELECT actual_started_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-29T23:55:56Z'::timestamptz,
  'the first meeting.started write records actual_started_at');

-- The replay: same occurrence, a different value. The sweep sends this.
UPDATE zoom_internal.zoom_meetings
   SET status = 'started', actual_started_at = '2001-01-01T00:00:00Z'
 WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001';

SELECT is(
  (SELECT actual_started_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-29T23:55:56Z'::timestamptz,
  'a REPLAYED meeting.started cannot overwrite an instant already recorded');

UPDATE zoom_internal.zoom_meetings
   SET status = 'ended', actual_ended_at = '2026-07-30T00:03:26Z'
 WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001';

SELECT is(
  (SELECT actual_ended_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-30T00:03:26Z'::timestamptz,
  'meeting.ended records actual_ended_at on the same row');

UPDATE zoom_internal.zoom_meetings
   SET status = 'ended', actual_ended_at = '2002-02-02T00:00:00Z'
 WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001';

SELECT is(
  (SELECT actual_ended_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-30T00:03:26Z'::timestamptz,
  'a REPLAYED meeting.ended cannot overwrite actual_ended_at either');

-- The trigger is inert for every other writer: an UPDATE naming neither column
-- carries NEW.col = OLD.col, and COALESCE(OLD, OLD) is OLD.
UPDATE zoom_internal.zoom_meetings
   SET last_error = 'z7-unrelated-write'
 WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001';

SELECT ok(
  (SELECT actual_started_at = '2026-07-29T23:55:56Z'::timestamptz
      AND actual_ended_at = '2026-07-30T00:03:26Z'::timestamptz
     FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  'an unrelated UPDATE leaves both instants exactly as they were');

SELECT * FROM finish();

ROLLBACK;
