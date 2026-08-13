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

SELECT plan(146);

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
-- Z7-1 — public.zoom_attendance persona matrix and write denial.
--
-- The §7 row is narrower than the projection table's above: admin sees all, the
-- FACILITATOR of that surface sees its rows, and a consultor reaches them ONLY by
-- being that facilitator. No GC member, no other school, no anon — leadership gets
-- API-computed aggregates and never these rows (PROJECT_STATE macro invariant).
--
-- Four personas carry the weight, and each exists because a plausible predicate
-- passes without it:
--
--  - `z_cons_a` is the discriminator. It and `z_fac_a` are BOTH active consultors at
--    School A; only the session_facilitators row separates them. A predicate that let
--    school scope leak into this table passes every other assert here and fails this.
--  - `z_fac_glb` is a consultor with **school_id NULL** who IS the assigned
--    facilitator. Under the inline-EXISTS predicate this persona was BROKEN: the
--    policy's subquery is itself subject to `session_facilitators` RLS, whose
--    `facilitators_consultor_select` requires `ur.school_id = cs.school_id`, so a
--    globally scoped facilitator could not read their OWN facilitator row and saw
--    nothing for a session they run. `public.is_zoom_surface_facilitator` is SECURITY
--    DEFINER precisely so the membership lookup no longer depends on that.
--  - `z_fac_cm` is the NAMED facilitator of a community meeting
--    (`community_meetings.facilitator_id`) — the other half of §7's `Fac` column, which
--    `session_facilitators` cannot express.
--  - The collision fixture gives a consultor_session and a community_meeting the SAME
--    uuid (separate tables, separate PKs, so this is reachable in production). It is
--    what makes `surface_type` load-bearing rather than decorative: without the switch
--    each surface's facilitator reads the other's attendance.
--
-- Fixtures stay synthetic (@test.local, Ley 21.719 — attendance rows name real
-- people in production and never in a test).
-- =============================================================================

SELECT tests.create_supabase_user('z_fac_a');
SELECT tests.create_supabase_user('z_fac_glb');
SELECT tests.create_supabase_user('z_fac_cm');
SELECT tests.create_supabase_user('z_fac_col');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('z_fac_a'), ('z_fac_glb'), ('z_fac_cm'), ('z_fac_col')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (tests.get_supabase_uid('z_fac_a'),   'consultor', 9901, NULL, true),
  -- No school scope at all: facilitation is this persona's ONLY path to a row.
  (tests.get_supabase_uid('z_fac_glb'), 'consultor', NULL, NULL, true),
  (tests.get_supabase_uid('z_fac_col'), 'consultor', 9901, NULL, true),
  -- A plain community member. Being named facilitator of the meeting is what grants.
  (tests.get_supabase_uid('z_fac_cm'),  'docente',   9901,
   'cccccccc-2222-0000-0000-000000000001', true);

-- S1 (School A, facilitated by z_fac_a AND z_fac_glb) · S2 (School B, nobody) ·
-- COLLIDE (School A, facilitated by z_fac_col) whose id is reused by a community
-- meeting below.
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
   tests.get_supabase_uid('z_admin')),
  ('a7a7a7a7-c011-0000-0000-000000000001', 9901,
   'cccccccc-2222-0000-0000-000000000001', 'Z7 RLS Collision Session', CURRENT_DATE,
   '13:00:00', '14:00:00', 'online', 'programada', true,
   tests.get_supabase_uid('z_admin'));

INSERT INTO public.session_facilitators (session_id, user_id, facilitator_role, is_lead)
VALUES
  ('a7a7a7a7-0000-0000-0000-000000000001', tests.get_supabase_uid('z_fac_a'),
   'consultor_externo', true),
  ('a7a7a7a7-0000-0000-0000-000000000001', tests.get_supabase_uid('z_fac_glb'),
   'consultor_externo', false),
  ('a7a7a7a7-c011-0000-0000-000000000001', tests.get_supabase_uid('z_fac_col'),
   'consultor_externo', true);

-- The collision: a community meeting whose PRIMARY KEY equals the session's above.
INSERT INTO public.community_workspaces (id, community_id, name)
VALUES ('a7a7a7a7-4444-0000-0000-000000000001',
        'cccccccc-2222-0000-0000-000000000001', 'Z7 RLS Workspace');

INSERT INTO public.community_meetings
  (id, workspace_id, title, meeting_date, created_by, facilitator_id, is_active)
VALUES
  ('a7a7a7a7-c011-0000-0000-000000000001',
   'a7a7a7a7-4444-0000-0000-000000000001', 'Z7 RLS Collision Meeting',
   now() + interval '1 day', tests.get_supabase_uid('z_admin'),
   tests.get_supabase_uid('z_fac_cm'), true);

-- Five attendance rows. ATT2 is the `unmatched` shape the §15.3.5 blind spot requires
-- to be storable — a link-join participant Zoom gave no identity field for. ATT4/ATT5
-- share a surface_id and differ only by surface_type. ATT3 is a REPORT row, which
-- since Z7-3 must name its batch and be closed — the fixture batch here satisfies
-- the reference; the promotion machinery has its own section below.
INSERT INTO zoom_internal.zoom_attendance_report_batches
  (id, school_id, surface_type, surface_id, zoom_meeting_uuid, status)
VALUES
  ('a7a7a7a7-8888-0000-0000-000000000098', 9902, 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000002', 'z7Synthetic/Occurrence/B==', 'pending');

INSERT INTO public.zoom_attendance
  (id, surface_type, surface_id, school_id, zoom_meeting_uuid,
   user_id, customer_key, display_name, transient_email, matched_by,
   joined_at, left_at, source, report_batch_id)
VALUES
  ('a7a7a7a7-1111-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/A==',
   tests.get_supabase_uid('z_fac_a'), '47d97a107c8f4c348519b4c77ed439d9', NULL, NULL,
   'customer_key', now() - interval '55 min', now() - interval '5 min', 'webhook', NULL),
  ('a7a7a7a7-1111-0000-0000-000000000002', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/A==',
   NULL, NULL, 'Asistente Sintetico Uno', NULL,
   'unmatched', now() - interval '50 min', NULL, 'webhook', NULL),
  ('a7a7a7a7-1111-0000-0000-000000000003', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000002', 9902, 'z7Synthetic/Occurrence/B==',
   NULL, NULL, NULL, 'z_cons_b@test.local',
   'email', now() - interval '40 min', now() - interval '10 min', 'report',
   'a7a7a7a7-8888-0000-0000-000000000098'),
  ('a7a7a7a7-1111-0000-0000-000000000004', 'consultor_session',
   'a7a7a7a7-c011-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/C==',
   NULL, NULL, 'Asistente Sintetico Sesion', NULL,
   'name', now() - interval '30 min', NULL, 'webhook', NULL),
  ('a7a7a7a7-1111-0000-0000-000000000005', 'community_meeting',
   'a7a7a7a7-c011-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/D==',
   NULL, NULL, 'Asistente Sintetico Reunion', NULL,
   'name', now() - interval '20 min', NULL, 'webhook', NULL);

SELECT tests.rls_enabled('public', 'zoom_attendance');

SELECT col_not_null(
  'public', 'zoom_attendance', 'school_id',
  'zoom_attendance.school_id is NOT NULL — the §6 invariant, every public row is school-scoped');

-- admin: all rows ---------------------------------------------------------------
SELECT tests.authenticate_as('z_admin');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  5, 'admin: sees all 5 attendance rows regardless of school or surface');

RESET ROLE;

-- (d) the school-scoped facilitator: its rows, and only its rows -----------------
SELECT tests.authenticate_as('z_fac_a');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  2, 'facilitator: sees exactly the 2 rows of the session they facilitate');

SELECT is_empty(
  $$ SELECT 1 FROM public.zoom_attendance
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000003' $$,
  'facilitator: cannot read another session''s attendance');

RESET ROLE;

-- (a) a GLOBALLY SCOPED consultor who is the assigned facilitator ----------------
-- school_id IS NULL, so no school predicate can reach these rows and the persona
-- cannot read its own session_facilitators row under that table's own RLS. It sees
-- the session's attendance anyway, which is the SECURITY DEFINER predicate working.
SELECT tests.authenticate_as('z_fac_glb');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  2, 'globally scoped consultor who IS the facilitator: sees the session''s 2 rows');

SELECT is_empty(
  $$ SELECT 1 FROM public.zoom_attendance
      WHERE id IN ('a7a7a7a7-1111-0000-0000-000000000003',
                   'a7a7a7a7-1111-0000-0000-000000000004') $$,
  'globally scoped facilitator: facilitation grants THAT session only, not a global read');

RESET ROLE;

-- (b) the NAMED community-meeting facilitator ------------------------------------
-- (c) ...and the collision: same uuid, different surface_type, different reader.
SELECT tests.authenticate_as('z_fac_cm');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  1, 'community-meeting facilitator: sees exactly their meeting''s attendance row');

SELECT is_empty(
  $$ SELECT 1 FROM public.zoom_attendance
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000004' $$,
  'COLLISION: the community facilitator cannot read the SESSION row sharing that uuid');

RESET ROLE;

SELECT tests.authenticate_as('z_fac_col');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  1, 'session facilitator at the collided uuid: sees exactly their session''s row');

SELECT is_empty(
  $$ SELECT 1 FROM public.zoom_attendance
      WHERE id = 'a7a7a7a7-1111-0000-0000-000000000005' $$,
  'COLLISION: the session facilitator cannot read the COMMUNITY row sharing that uuid');

RESET ROLE;

-- (d) consultor at the SAME school who is not the facilitator: nothing -----------
SELECT tests.authenticate_as('z_cons_a');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  0, 'consultor A (School A, NOT the facilitator): sees nothing — school scope grants nothing here');

RESET ROLE;

-- (d) another school: nothing -----------------------------------------------------
SELECT tests.authenticate_as('z_cons_b');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  0, 'consultor B (School B): sees nothing, including their own school''s row');

RESET ROLE;

-- (d) GC member: nothing (unlike the projection table, which they DO read) --------
SELECT tests.authenticate_as('z_gc_mem');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance),
  0, 'active GC member: sees no attendance rows — this table is not community-readable');

RESET ROLE;

-- anon: nothing, and HARDER than nothing -----------------------------------------
-- Unlike session_meetings_public above, anon does not get an empty result here — it
-- gets 42501. `is_zoom_surface_facilitator` is EXECUTE-revoked from PUBLIC and anon,
-- so the policy cannot even be evaluated for an unauthenticated caller. That is a
-- stricter denial than an empty set (anon cannot probe "is anyone the facilitator of
-- surface X"), and it is asserted rather than assumed because the failure MODE
-- changed: a future reader that expects `[]` from PostgREST will see an error instead.
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT set_config('role', 'anon', true);

SELECT throws_ok(
  $$ SELECT count(*) FROM public.zoom_attendance $$,
  '42501',
  NULL,
  'anon: cannot read attendance at all — the facilitator predicate is not executable by anon');

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
-- Z7-1 — the facilitator predicate itself.
--
-- It is SECURITY DEFINER, so its grants are the whole of its blast radius. It
-- returns one boolean and no rows, so an accidental grant leaks a membership bit
-- rather than data — but `anon` must still not be able to probe "is user X the
-- facilitator of surface Y", and PUBLIC must not hold it by default.
-- =============================================================================

SELECT is(has_function_privilege('anon',
  'public.is_zoom_surface_facilitator(text, uuid)', 'EXECUTE'), false,
  'anon cannot execute is_zoom_surface_facilitator');
SELECT is(has_function_privilege('authenticated',
  'public.is_zoom_surface_facilitator(text, uuid)', 'EXECUTE'), true,
  'authenticated can execute is_zoom_surface_facilitator — the policy is evaluated as them');

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_zoom_surface_facilitator'),
  true, 'is_zoom_surface_facilitator is SECURITY DEFINER — the membership lookup bypasses the caller''s RLS');

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_zoom_surface_facilitator'),
  1, 'is_zoom_surface_facilitator has no overload — one definition, one predicate');

-- An unknown surface type denies rather than inheriting somebody else's grant.
SELECT tests.authenticate_as('z_fac_a');

SELECT is(
  public.is_zoom_surface_facilitator('some_future_surface',
    'a7a7a7a7-0000-0000-0000-000000000001'), false,
  'an unrecognised surface_type falls through to false, never to another branch''s answer');

RESET ROLE;

-- =============================================================================
-- Z7-1 — the C6 amendment: zoom_internal.zoom_meetings.actual_*.
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
-- Z7-1 — zoom_internal.apply_meeting_lifecycle: the guard, the fill-while-NULL
-- rule, and the correction path Z7-3 still needs.
--
-- These are behaviour tests against a real database because the properties live in
-- SQL: `__tests__/lib/zoom/webhook-store.test.ts` proves the store SENDS the
-- applies-from set, and `webhook-lifecycle-instants.test.ts` proves the lifecycle
-- offers the right instants — neither can prove Postgres honours either rule.
--
-- Calls run AS service_role, matching the production client and proving the grant is
-- what the runner actually calls through. host_zoom_user_id is NULL so these fixtures
-- cannot collide with the §9 EXCLUDE reservation.
-- =============================================================================

SELECT is(has_function_privilege('anon',
  'zoom_internal.apply_meeting_lifecycle(uuid, text, text[], text, timestamptz, timestamptz)',
  'EXECUTE'), false, 'anon cannot execute apply_meeting_lifecycle');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.apply_meeting_lifecycle(uuid, text, text[], text, timestamptz, timestamptz)',
  'EXECUTE'), false, 'authenticated cannot execute apply_meeting_lifecycle');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.apply_meeting_lifecycle(uuid, text, text[], text, timestamptz, timestamptz)',
  'EXECUTE'), true, 'service_role can execute apply_meeting_lifecycle');

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal' AND p.proname = 'apply_meeting_lifecycle'),
  false, 'apply_meeting_lifecycle is SECURITY INVOKER — the caller is already service_role, so DEFINER would add privilege it does not need');

SELECT is(
  (SELECT oidvectortypes(p.proargtypes)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal' AND p.proname = 'apply_meeting_lifecycle'),
  'uuid, text, text[], text, timestamp with time zone, timestamp with time zone',
  'apply_meeting_lifecycle has exactly the 6-argument identity the store calls');

INSERT INTO zoom_internal.zoom_meetings
  (id, surface_type, surface_id, school_id, host_zoom_user_id, zoom_meeting_number,
   status, starts_at, duration_minutes)
VALUES
  -- M1: the in-order path — started, replay, then a deliberate correction.
  ('a7a7a7a7-2222-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-3333-0000-0000-000000000001', 9901, NULL, 86084701483,
   'provisioned', '2026-07-29T23:30:00Z', 60),
  -- M2: the OUT-OF-ORDER path — ended first, then a swept started.
  ('a7a7a7a7-2222-0000-0000-000000000002', 'consultor_session',
   'a7a7a7a7-3333-0000-0000-000000000002', 9901, NULL, 86084701484,
   'provisioned', '2026-07-29T23:30:00Z', 60);

SET LOCAL ROLE service_role;

-- M1(a) the ordinary first delivery.
SELECT is(
  (SELECT count(*)::int FROM zoom_internal.apply_meeting_lifecycle(
     'a7a7a7a7-2222-0000-0000-000000000001', 'started',
     ARRAY['pending', 'provisioned', 'started'], 'z7Occurrence/M1==',
     '2026-07-29T23:55:56Z', NULL)),
  1, 'apply_meeting_lifecycle returns the surface row when the guard applies');

SELECT ok(
  (SELECT status = 'started'
          AND zoom_meeting_uuid = 'z7Occurrence/M1=='
          AND actual_started_at = '2026-07-29T23:55:56Z'::timestamptz
          AND actual_ended_at IS NULL
     FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  'meeting.started records status, the occurrence uuid and actual_started_at in one statement');

-- M1(b) the sweep replays the same event minutes later, with a different value.
-- `started` is in its own applies-from set, so this APPLIES — the fill-while-NULL
-- COALESCE, not the guard, is what protects the recorded instant.
SELECT is(
  (SELECT count(*)::int FROM zoom_internal.apply_meeting_lifecycle(
     'a7a7a7a7-2222-0000-0000-000000000001', 'started',
     ARRAY['pending', 'provisioned', 'started'], 'Different/Occurrence==',
     '2001-01-01T00:00:00Z', NULL)),
  1, 'a replayed meeting.started still applies — duplicate deliveries are not errors');

SELECT is(
  (SELECT actual_started_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-29T23:55:56Z'::timestamptz,
  'a REPLAYED meeting.started cannot overwrite an instant already recorded');

SELECT is(
  (SELECT zoom_meeting_uuid FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  'z7Occurrence/M1==',
  '[Z7-R2.1] an applying replay with a DIFFERENT UUID cannot overwrite established occurrence identity');

-- M1(c) THE CORRECTION PATH Z7-3 needs. §11 makes the reconcile participant report
-- authoritative over webhooks, so the fill-while-NULL rule must be scoped to the
-- lifecycle function and NOT to the table. A direct service-role UPDATE still wins.
UPDATE zoom_internal.zoom_meetings
   SET actual_started_at = '2026-07-29T23:56:30Z'
 WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001';

SELECT is(
  (SELECT actual_started_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-29T23:56:30Z'::timestamptz,
  'a deliberate service-role UPDATE CAN correct an instant — the Z7-3 reconcile path stays open');

-- M2(a) OUT OF ORDER: `meeting.ended` arrives first. Its payload states when the
-- occurrence began as well as when it finished, so both columns land here.
SELECT is(
  (SELECT count(*)::int FROM zoom_internal.apply_meeting_lifecycle(
     'a7a7a7a7-2222-0000-0000-000000000002', 'ended',
     ARRAY['pending', 'provisioned', 'started', 'ended', 'error'], 'z7Occurrence/M2==',
     '2026-07-29T23:55:56Z', '2026-07-30T00:03:26Z')),
  1, 'meeting.ended applies over provisioned — the ended set is the wider one');

SELECT ok(
  (SELECT actual_started_at = '2026-07-29T23:55:56Z'::timestamptz
          AND actual_ended_at = '2026-07-30T00:03:26Z'::timestamptz
          AND zoom_meeting_uuid = 'z7Occurrence/M2=='
     FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000002'),
  'an out-of-order meeting.ended records BOTH exact instants and the report occurrence uuid');

-- M2(b) ...and the swept `meeting.started` fifteen minutes later is refused by the
-- guard, so it can neither overwrite the instants nor resurrect a finished meeting.
SELECT is(
  (SELECT count(*)::int FROM zoom_internal.apply_meeting_lifecycle(
     'a7a7a7a7-2222-0000-0000-000000000002', 'started',
     ARRAY['pending', 'provisioned', 'started'], 'Different/Occurrence==',
     '2001-01-01T00:00:00Z', NULL)),
  0, 'a swept meeting.started over an ended meeting matches zero rows — the guard refuses it');

SELECT ok(
  (SELECT status = 'ended'
          AND actual_started_at = '2026-07-29T23:55:56Z'::timestamptz
          AND actual_ended_at = '2026-07-30T00:03:26Z'::timestamptz
          AND zoom_meeting_uuid = 'z7Occurrence/M2=='
     FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000002'),
  'after the refused replay the row still holds both instants and occurrence identity unchanged');

SELECT is(
  (SELECT count(*)::int
     FROM zoom_internal.zoom_meetings m
    WHERE m.status = 'ended'
      AND m.zoom_meeting_uuid = 'z7Occurrence/M2=='
      AND NOT EXISTS (
        SELECT 1 FROM zoom_internal.zoom_attendance_report_batches b
         WHERE b.zoom_meeting_uuid = m.zoom_meeting_uuid
           AND b.status = 'complete'
      )),
  1,
  '[Z7-R2.1] the ended-before-started occurrence remains eligible for report reconciliation');

RESET ROLE;

-- =============================================================================
-- Z7-2 — participant_uuid, the partial unique index, and the interval-order CHECK.
--
-- Three claims, and the second is the one that has to be proved in Postgres rather
-- than in the applier: a redelivered `participant_joined` is absorbed by the DATABASE.
-- Zoom retries and `webhook_sweep` deliberately replays events minutes later, so "the
-- applier checks first" is a race, not a guarantee.
--
-- The index is PARTIAL on purpose. A participant whose uuid Zoom omitted must still get
-- a row: a total unique index would collapse every anonymous guest of one occurrence
-- into a single interval, which is the double-count in reverse.
-- =============================================================================

SELECT has_column('public', 'zoom_attendance', 'participant_uuid',
  'zoom_attendance.participant_uuid exists — the ONLY token that may authorise closure (§15.3.9)');
SELECT col_is_null('public', 'zoom_attendance', 'participant_uuid',
  'participant_uuid is nullable — Zoom omits it, and such rows close only via the Z7-3 report');

-- The index exists, is UNIQUE, is PARTIAL, and includes joined_at. All four matter: a
-- total unique index would collapse anonymous guests; a two-column key would refuse a
-- genuine rejoin that reuses the meeting-scoped uuid.
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'zoom_attendance'
      AND indexname = 'zoom_attendance_participant_occurrence_key'),
  1, 'the participant/occurrence unique index exists');

SELECT ok(
  (SELECT indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(zoom_meeting_uuid, participant_uuid, joined_at)%'
      AND indexdef LIKE '%WHERE (participant_uuid IS NOT NULL)%'
     FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'zoom_attendance_participant_occurrence_key'),
  'the index is UNIQUE, PARTIAL, and widened by joined_at — a rejoin reusing the uuid is a new row');

-- Fixtures for the behavioural half. Reuses School A's session from the Z7-1 block.
INSERT INTO public.zoom_attendance
  (id, surface_type, surface_id, school_id, zoom_meeting_uuid,
   participant_uuid, matched_by, joined_at, source)
VALUES
  ('a7a7a7a7-5555-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/P==',
   '364B3A17-05C0-6B63-F4FA-2180DCC26971', 'customer_key',
   '2026-07-29T23:55:56Z', 'webhook');

-- THE REDELIVERY, at the database. Same occurrence, same participant_uuid, same
-- joined_at — the same join event delivered again.
SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, matched_by, joined_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/P==', '364B3A17-05C0-6B63-F4FA-2180DCC26971',
             'customer_key', '2026-07-29T23:55:56Z', 'webhook') $$,
  '23505',
  NULL,
  'a redelivered participant_joined is refused by the partial unique index');

-- ...but a REJOIN that reuses the uuid at a LATER instant is a genuinely new interval.
-- Zoom's participant_uuid is meeting-scoped, not connection-scoped, so this is exactly
-- what the widening by joined_at exists to admit.
SELECT lives_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, matched_by, joined_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/P==', '364B3A17-05C0-6B63-F4FA-2180DCC26971',
             'customer_key', '2026-07-30T00:10:00Z', 'webhook') $$,
  'a rejoin reusing the participant_uuid at a later joined_at inserts cleanly');

-- The SAME participant in a DIFFERENT occurrence is a different interval.
SELECT lives_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, matched_by, joined_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/Q==', '364B3A17-05C0-6B63-F4FA-2180DCC26971',
             'customer_key', '2026-07-30T10:00:00Z', 'webhook') $$,
  'the same participant_uuid in another occurrence inserts cleanly');

-- ...and TWO uuid-less rows in ONE occurrence both survive, which is what the PARTIAL
-- predicate buys. A total unique index would reject the second and lose a guest.
SELECT lives_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, display_name, matched_by, joined_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/P==', NULL, 'Invitada Sintetica Una',
             'unmatched', '2026-07-29T23:57:00Z', 'webhook'),
            ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/P==', NULL, 'Invitada Sintetica Dos',
             'unmatched', '2026-07-29T23:58:00Z', 'webhook') $$,
  'two uuid-less participants in one occurrence both get a row (the index is PARTIAL)');

-- The interval-order CHECK. The applier is what keeps a malformed leave from ever
-- reaching this constraint ([R7]); the constraint is what refuses a future writer that
-- skips that reasoning.
SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        matched_by, joined_at, left_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/R==', 'unmatched',
             '2026-07-30T00:05:00Z', '2026-07-29T23:55:00Z', 'webhook') $$,
  '23514',
  NULL,
  'a left_at BEFORE joined_at is refused by zoom_attendance_interval_order');

SELECT lives_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        matched_by, joined_at, left_at, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/S==', 'unmatched',
             '2026-07-29T23:55:00Z', '2026-07-29T23:55:00Z', 'webhook') $$,
  'a zero-length interval is allowed — Zoom reports whole seconds and it really happens');

SELECT lives_ok(
  $$ UPDATE public.zoom_attendance
        SET left_at = '2026-07-30T00:05:00Z'
      WHERE id = 'a7a7a7a7-5555-0000-0000-000000000001' $$,
  'closing an open interval forward is allowed');

SELECT throws_ok(
  $$ UPDATE public.zoom_attendance
        SET left_at = '2026-07-29T00:00:00Z'
      WHERE id = 'a7a7a7a7-5555-0000-0000-000000000001' $$,
  '23514',
  NULL,
  'the CHECK also refuses a backwards close, not only a bad INSERT');

-- Z7-1's write denial still holds for the new column: no non-SELECT policy appeared.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'zoom_attendance' AND cmd <> 'SELECT'),
  0, 'zoom_attendance still carries no non-SELECT policy after the Z7-2 migration');

-- =============================================================================
-- Z7-2 — identity_tokens as reconciliation evidence, and source_event_key.
--
-- identity_tokens persists EVERY rank a participant presented. Under §15.3.9 it is
-- reconciliation evidence only — Z7-3 and the facilitator suggestion consume it, and
-- nothing closes on it. The containment demonstrations below are kept because they
-- PROVE the ambiguity the replan rests on: a weak token is shared between two people
-- in ways no storage design can repair, which is why closure now requires a
-- Zoom-minted participant_uuid.
--
-- source_event_key: uuid-less redelivery had no database constraint at all and was
-- defended by a read-then-insert, which two concurrent deliveries can both lose. It
-- is the ledger's sha256 dedupe_key, UNIQUE, so the second delivery is refused inside
-- Postgres regardless of interleaving.
-- =============================================================================

SELECT has_column('public', 'zoom_attendance', 'identity_tokens',
  'zoom_attendance.identity_tokens exists — EVERY presented rank, as evidence');
SELECT has_column('public', 'zoom_attendance', 'source_event_key',
  'zoom_attendance.source_event_key exists — delivery-level idempotency');

SELECT ok(
  (SELECT indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%WHERE (source_event_key IS NOT NULL)%'
     FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'zoom_attendance_source_event_key'),
  'source_event_key carries a PARTIAL UNIQUE index — Z7-3 report rows stay NULL and excluded');

SELECT ok(
  (SELECT indexdef LIKE '%USING gin%'
     FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'zoom_attendance_identity_tokens_idx'),
  'identity_tokens is GIN-indexed — evidence lookups are array containment, not equality');

-- The ambiguity that forced the replan, at the database. A presented a customer_key
-- AND the shared name, so A's row carries BOTH ranks; B presented only the name.
INSERT INTO public.zoom_attendance
  (id, surface_type, surface_id, school_id, zoom_meeting_uuid,
   participant_uuid, customer_key, display_name, matched_by, joined_at,
   identity_tokens, source_event_key, source)
VALUES
  ('a7a7a7a7-6666-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/T==',
   NULL, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'Ana Perez Sintetica', 'unmatched',
   '2026-07-29T23:55:00Z',
   ARRAY['ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'nm:ana perez sintetica'],
   'delivery-t-1', 'webhook'),
  ('a7a7a7a7-6666-0000-0000-000000000002', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/T==',
   NULL, NULL, 'Ana Perez Sintetica', 'unmatched',
   '2026-07-29T23:56:00Z',
   ARRAY['nm:ana perez sintetica'],
   'delivery-t-2', 'webhook');

-- A strong token names exactly one row — good enough to SUGGEST who a row is about.
SELECT is(
  (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.zoom_attendance
    WHERE zoom_meeting_uuid = 'z7Synthetic/Occurrence/T=='
      AND left_at IS NULL
      AND identity_tokens @> ARRAY['ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1']),
  'a7a7a7a7-6666-0000-0000-000000000001',
  'a strong evidence token names exactly one interval — usable as a suggestion');

-- The weak token matches BOTH people, because A carries it at a weaker rank. This is
-- the indistinguishability §15.3.9 rests on: no query over client-assertable evidence
-- can pick one of these rows safely, which is why closure requires a Zoom-minted
-- participant_uuid and everything here is evidence for humans and the report.
SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE zoom_meeting_uuid = 'z7Synthetic/Occurrence/T=='
      AND left_at IS NULL
      AND identity_tokens @> ARRAY['nm:ana perez sintetica']),
  2, 'a weak evidence token matches both people — the ambiguity no heuristic can resolve');

-- The refutation of the withdrawn single-primary-token model, kept as a live assert:
-- keyed on "the primary token" the downgraded evidence names ONLY the namesake.
SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE zoom_meeting_uuid = 'z7Synthetic/Occurrence/T=='
      AND left_at IS NULL
      AND identity_tokens[1] = 'nm:ana perez sintetica'),
  1, 'keyed on the PRIMARY token alone the downgraded evidence names only the namesake — the refuted model');

-- P1-2, at the database: the same delivery key cannot produce a second row, even though
-- both rows are uuid-less and the participant_uuid index therefore does not apply.
SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, matched_by, joined_at, identity_tokens, source_event_key, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/T==', NULL, 'unmatched', '2026-07-29T23:55:00Z',
             ARRAY['ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'], 'delivery-t-1', 'webhook') $$,
  '23505',
  NULL,
  'P1-2: a uuid-less redelivery is refused by the source_event_key unique index');

-- A different delivery for the same person IS a new row — a genuine rejoin must not be
-- swallowed by the idempotency key.
SELECT lives_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, matched_by, joined_at, identity_tokens, source_event_key, source)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/T==', NULL, 'unmatched', '2026-07-30T00:10:00Z',
             ARRAY['ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'], 'delivery-t-3', 'webhook') $$,
  'a genuine rejoin carries a different delivery key and opens a new interval');

-- Rows with no delivery key (Z7-3's report path) are excluded by the partial
-- predicate. Report rows must name a batch and be closed (Z7-3 CHECKs), so the
-- fixture batch below exists only to satisfy the FK — its status is irrelevant here.
INSERT INTO zoom_internal.zoom_attendance_report_batches
  (id, school_id, surface_type, surface_id, zoom_meeting_uuid, status)
VALUES
  ('a7a7a7a7-8888-0000-0000-000000000099', 9901, 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 'z7Synthetic/Occurrence/U==', 'pending');

SELECT lives_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid,
        participant_uuid, matched_by, joined_at, left_at, identity_tokens,
        source_event_key, source, report_batch_id)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/U==', NULL, 'unmatched', '2026-07-30T00:20:00Z',
             '2026-07-30T00:40:00Z', NULL, NULL, 'report',
             'a7a7a7a7-8888-0000-0000-000000000099'),
            ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/U==', NULL, 'unmatched', '2026-07-30T00:21:00Z',
             '2026-07-30T00:41:00Z', NULL, NULL, 'report',
             'a7a7a7a7-8888-0000-0000-000000000099') $$,
  'two rows with a NULL source_event_key both insert — the index is PARTIAL for Z7-3');

-- =============================================================================
-- Z7-2 — zoom_internal.apply_participant_leave: the §15.3.9 close rule and the
-- one-transaction observation, proved against the real function.
--
-- The vitest matrix drives the applier over a store DOUBLE; this section is the half
-- a double cannot supply — that Postgres itself enforces the rule and the boundary:
--
--   · closure requires participant_uuid matching EXACTLY ONE open row (zero, two,
--     uuid-less and out-of-order all close nothing);
--   · every leave records an observation carrying the decided outcome;
--   · a duplicate delivery does NOTHING AT ALL — including the [C6b] probe, where a
--     pre-seeded observation key makes the function's own close ROLL BACK, which is
--     the transaction boundary itself, not just the end state.
--
-- Calls run AS service_role, matching the production client.
-- =============================================================================

SELECT is(has_function_privilege('anon',
  'zoom_internal.apply_participant_leave(integer, text, text, timestamptz, text, text, text, text, text[])',
  'EXECUTE'), false, 'anon cannot execute apply_participant_leave');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.apply_participant_leave(integer, text, text, timestamptz, text, text, text, text, text[])',
  'EXECUTE'), false, 'authenticated cannot execute apply_participant_leave');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.apply_participant_leave(integer, text, text, timestamptz, text, text, text, text, text[])',
  'EXECUTE'), true, 'service_role can execute apply_participant_leave');

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal' AND p.proname = 'apply_participant_leave'),
  false, 'apply_participant_leave is SECURITY INVOKER — the caller is already service_role');

-- Fixtures: one occurrence, the histories the matrix names. Seeded as postgres.
INSERT INTO public.zoom_attendance
  (id, surface_type, surface_id, school_id, zoom_meeting_uuid,
   participant_uuid, display_name, matched_by, joined_at, identity_tokens, source)
VALUES
  -- L1: exactly one open row for its uuid — the closable case.
  ('a7a7a7a7-7777-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/L==',
   'LEAVE-UUID-ONE', 'Cierre Limpio', 'unmatched', '2026-07-29T23:50:00Z',
   ARRAY['nm:cierre limpio'], 'webhook'),
  -- L5: TWO open rows under one uuid (the first leave was lost).
  ('a7a7a7a7-7777-0000-0000-000000000002', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/L==',
   'LEAVE-UUID-TWO', 'Doble Abierta', 'unmatched', '2026-07-29T23:51:00Z',
   NULL, 'webhook'),
  ('a7a7a7a7-7777-0000-0000-000000000003', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/L==',
   'LEAVE-UUID-TWO', 'Doble Abierta', 'unmatched', '2026-07-30T00:02:00Z',
   NULL, 'webhook'),
  -- L4: a uuid-less open row whose evidence a uuid-less leave will match.
  ('a7a7a7a7-7777-0000-0000-000000000004', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/L==',
   NULL, 'Ana Homonima', 'unmatched', '2026-07-29T23:52:00Z',
   ARRAY['nm:ana homonima'], 'webhook'),
  -- L7: an open row whose join the leave will PRECEDE.
  ('a7a7a7a7-7777-0000-0000-000000000005', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/L==',
   'LEAVE-UUID-LATE', 'Se Fue Antes', 'unmatched', '2026-07-30T00:30:00Z',
   NULL, 'webhook'),
  -- L3: the transaction-boundary probe's open row.
  ('a7a7a7a7-7777-0000-0000-000000000006', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/L==',
   'LEAVE-UUID-TXN', 'Frontera Transaccional', 'unmatched', '2026-07-29T23:53:00Z',
   NULL, 'webhook');

-- L3's pre-seeded observation: the delivery was already applied by "the other" caller.
INSERT INTO zoom_internal.zoom_attendance_observations
  (school_id, zoom_meeting_uuid, event_type, source_event_key, observed_at,
   participant_uuid, outcome)
VALUES
  (9901, 'z7Synthetic/Occurrence/L==', 'meeting.participant_left', 'obs-txn-1',
   '2026-07-30T00:05:00Z', 'LEAVE-UUID-TXN', 'interval_closed');

SET LOCAL ROLE service_role;

-- L1 — the closable case: exactly one open row, instant after the join.
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l1-1', '2026-07-30T00:05:00Z',
    'LEAVE-UUID-ONE', NULL, 'Cierre Limpio', NULL, ARRAY['nm:cierre limpio']),
  'interval_closed',
  'L1: a uuid matching exactly one open row closes it');

SELECT is(
  (SELECT left_at FROM public.zoom_attendance
    WHERE id = 'a7a7a7a7-7777-0000-0000-000000000001'),
  '2026-07-30T00:05:00Z'::timestamptz,
  'L1: the interval is closed at the observed instant');

SELECT ok(
  (SELECT school_id = 9901
          AND event_type = 'meeting.participant_left'
          AND observed_at = '2026-07-30T00:05:00Z'::timestamptz
          AND participant_uuid = 'LEAVE-UUID-ONE'
          AND display_name = 'Cierre Limpio'
          AND identity_tokens = ARRAY['nm:cierre limpio']
          AND outcome = 'interval_closed'
     FROM zoom_internal.zoom_attendance_observations
    WHERE source_event_key = 'obs-l1-1'),
  'L1: the observation records the evidence AND the decided outcome');

-- L2 — the same delivery again: nothing happens, and only one observation exists.
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l1-1', '2026-07-30T00:05:00Z',
    'LEAVE-UUID-ONE', NULL, 'Cierre Limpio', NULL, ARRAY['nm:cierre limpio']),
  'observation_duplicate',
  'L2: a duplicate delivery reports observation_duplicate');

SELECT is(
  (SELECT count(*)::int FROM zoom_internal.zoom_attendance_observations
    WHERE source_event_key = 'obs-l1-1'),
  1, 'L2: the UNIQUE key admits exactly one observation for the delivery');

-- L3 — THE TRANSACTION BOUNDARY ([C6b]). The observation for 'obs-txn-1' already
-- exists, so this call's INSERT conflicts — and the conflict must roll back the close
-- the call just performed. If observation and close were two transactions, the row
-- would now be closed with no record of who closed it.
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-txn-1', '2026-07-30T00:06:00Z',
    'LEAVE-UUID-TXN', NULL, 'Frontera Transaccional', NULL, NULL),
  'observation_duplicate',
  'L3: a delivery another application already recorded reports observation_duplicate');

SELECT is(
  (SELECT left_at FROM public.zoom_attendance
    WHERE id = 'a7a7a7a7-7777-0000-0000-000000000006'),
  NULL,
  'L3: the close ROLLED BACK with the observation conflict — one transaction, provably');

-- L4 — a uuid-less leave, whatever evidence it carries, closes nothing. This is the
-- H1/H2 safety at the SQL level: the open homonym row stays open.
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l4-1', '2026-07-30T00:07:00Z',
    NULL, NULL, 'Ana Homonima', NULL, ARRAY['nm:ana homonima']),
  'unpairable_leave',
  'L4: a uuid-less leave is unpairable — evidence never authorises a close');

SELECT is(
  (SELECT left_at FROM public.zoom_attendance
    WHERE id = 'a7a7a7a7-7777-0000-0000-000000000004'),
  NULL,
  'L4: the matching-evidence open row STAYS OPEN');

SELECT ok(
  (SELECT outcome = 'unpairable_leave' AND identity_tokens = ARRAY['nm:ana homonima']
     FROM zoom_internal.zoom_attendance_observations
    WHERE source_event_key = 'obs-l4-1'),
  'L4: the observation still records the leave and its evidence');

-- L5 — two open rows under one uuid: rule 3 closes NOTHING.
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l5-1', '2026-07-30T00:08:00Z',
    'LEAVE-UUID-TWO', NULL, 'Doble Abierta', NULL, NULL),
  'no_open_interval',
  'L5: more than one open match closes nothing');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE participant_uuid = 'LEAVE-UUID-TWO' AND left_at IS NULL),
  2, 'L5: both ambiguous rows stay open for the report to resolve');

-- L6 — no usable instant: recorded as such, nothing fabricated.
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l6-1', NULL,
    'LEAVE-UUID-ONE', NULL, 'Cierre Limpio', NULL, NULL),
  'no_instant',
  'L6: a leave with no instant closes nothing and reports no_instant');

SELECT ok(
  (SELECT observed_at IS NULL AND outcome = 'no_instant'
     FROM zoom_internal.zoom_attendance_observations
    WHERE source_event_key = 'obs-l6-1'),
  'L6: the observation records the missing instant as missing');

-- L7 — a leave that PRECEDES the only open join closes nothing ([C9]).
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l7-1', '2026-07-30T00:20:00Z',
    'LEAVE-UUID-LATE', NULL, 'Se Fue Antes', NULL, NULL),
  'no_open_interval',
  'L7: a leave preceding the open join closes nothing');

SELECT is(
  (SELECT left_at FROM public.zoom_attendance
    WHERE id = 'a7a7a7a7-7777-0000-0000-000000000005'),
  NULL,
  'L7: the out-of-order row stays open rather than violating the CHECK');

-- L8 — a uuid that matches ZERO open rows: the missing-join history ([C2]).
SELECT is(
  zoom_internal.apply_participant_leave(
    9901, 'z7Synthetic/Occurrence/L==', 'obs-l8-1', '2026-07-30T00:09:00Z',
    'LEAVE-UUID-NEVER-JOINED', NULL, 'Sin Entrada', NULL, NULL),
  'no_open_interval',
  'L8: a leave whose join was never seen closes nothing');

SELECT ok(
  (SELECT outcome = 'no_open_interval'
     FROM zoom_internal.zoom_attendance_observations
    WHERE source_event_key = 'obs-l8-1'),
  'L8: ...and its observation is still durably recorded');

RESET ROLE;

-- =============================================================================
-- Z7-3 — zoom_internal.promote_attendance_report_batch: atomic promotion, the
-- completeness re-check, and the report-row CHECKs.
--
-- The job's suite proves the traversal/rejection discipline over doubles; this
-- section is the half only Postgres can supply — that a batch's rows and its flip
-- to `complete` are ONE transaction, so a candidate the database refuses leaves the
-- batch pending and ZERO rows visible, never a half-promoted winner.
-- =============================================================================

SELECT is(has_function_privilege('anon',
  'zoom_internal.promote_attendance_report_batch(uuid, jsonb, integer, integer, integer, timestamptz)',
  'EXECUTE'), false, 'anon cannot execute promote_attendance_report_batch');
SELECT is(has_function_privilege('authenticated',
  'zoom_internal.promote_attendance_report_batch(uuid, jsonb, integer, integer, integer, timestamptz)',
  'EXECUTE'), false, 'authenticated cannot execute promote_attendance_report_batch');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.promote_attendance_report_batch(uuid, jsonb, integer, integer, integer, timestamptz)',
  'EXECUTE'), true, 'service_role can execute promote_attendance_report_batch');

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zoom_internal' AND p.proname = 'promote_attendance_report_batch'),
  false, 'promote_attendance_report_batch is SECURITY INVOKER — the caller is already service_role');

-- Fixtures: two pending candidate batches for one occurrence. Seeded as postgres.
INSERT INTO zoom_internal.zoom_attendance_report_batches
  (id, school_id, surface_type, surface_id, zoom_meeting_uuid, status)
VALUES
  ('a7a7a7a7-8888-0000-0000-000000000001', 9901, 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 'z7Synthetic/Occurrence/B==', 'pending'),
  ('a7a7a7a7-8888-0000-0000-000000000002', 9901, 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 'z7Synthetic/Occurrence/B==', 'pending'),
  ('a7a7a7a7-8888-0000-0000-000000000003', 9901, 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 'z7Synthetic/Occurrence/C==', 'pending');

SET LOCAL ROLE service_role;

-- B1 — the happy promotion: rows in, batch complete, one transaction.
SELECT is(
  zoom_internal.promote_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000001',
    '[{"display_name": "Reporte Uno", "matched_by": "unmatched",
       "joined_at": "2026-07-29T23:56:00Z", "left_at": "2026-07-30T00:30:00Z",
       "identity_tokens": ["nm:reporte uno"]},
      {"display_name": "Reporte Dos", "matched_by": "unmatched",
       "joined_at": "2026-07-29T23:57:00Z", "left_at": "2026-07-30T00:31:00Z"}]'::jsonb,
    100, 1, 2, '2026-07-30T02:00:00Z'),
  'promoted',
  'B1: a complete candidate promotes');

SELECT ok(
  (SELECT status = 'complete' AND row_count = 2 AND total_records = 2
     FROM zoom_internal.zoom_attendance_report_batches
    WHERE id = 'a7a7a7a7-8888-0000-0000-000000000001'),
  'B1: the batch is complete with agreeing counts');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE report_batch_id = 'a7a7a7a7-8888-0000-0000-000000000001'),
  2, 'B1: exactly the promoted rows exist for the batch');

SELECT ok(
  (SELECT bool_and(source = 'report' AND left_at IS NOT NULL AND participant_uuid IS NULL
                   AND source_event_key IS NULL AND school_id = 9901)
     FROM public.zoom_attendance
    WHERE report_batch_id = 'a7a7a7a7-8888-0000-0000-000000000001'),
  'B1: report rows are closed, batch-scoped, school-scoped, and carry NO participant_uuid or delivery key');

-- B2 — THE TRANSACTION BOUNDARY: a candidate whose row count does not match
-- total_records aborts WHOLE — the batch stays pending and zero rows land.
SELECT throws_ok(
  $$ SELECT zoom_internal.promote_attendance_report_batch(
       'a7a7a7a7-8888-0000-0000-000000000002',
       '[{"display_name": "Solo Una", "matched_by": "unmatched",
          "joined_at": "2026-07-29T23:56:00Z", "left_at": "2026-07-30T00:30:00Z"}]'::jsonb,
       100, 1, 2, '2026-07-30T02:00:00Z') $$,
  'P0001',
  NULL,
  'B2: a count mismatch raises — the completeness re-check lives inside the transaction');

SELECT ok(
  (SELECT status = 'pending' AND row_count IS NULL
     FROM zoom_internal.zoom_attendance_report_batches
    WHERE id = 'a7a7a7a7-8888-0000-0000-000000000002'),
  'B2: the refused batch is still pending — the flip rolled back');

SELECT is(
  (SELECT count(*)::int FROM public.zoom_attendance
    WHERE report_batch_id = 'a7a7a7a7-8888-0000-0000-000000000002'),
  0, 'B2: ZERO rows exist for the refused batch — rows and flip are one transaction');

-- B3 — a completed batch cannot be promoted twice.
SELECT is(
  zoom_internal.promote_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000001', '[]'::jsonb, 100, 1, 0, '2026-07-30T03:00:00Z'),
  'batch_not_pending',
  'B3: promoting a complete batch again is refused, not re-run');

SELECT is(
  zoom_internal.reject_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000001', 'post_commit_transport_failure'),
  'batch_not_pending',
  '[Z7-R2.2] rejection after a committed promotion cannot demote COMPLETE');

SELECT ok(
  (SELECT status = 'complete' AND rejection_reason IS NULL
     FROM zoom_internal.zoom_attendance_report_batches
    WHERE id = 'a7a7a7a7-8888-0000-0000-000000000001'),
  '[Z7-R2.2] the complete batch remains complete after ambiguous-outcome rejection');

SELECT is(
  (SELECT id FROM zoom_internal.zoom_attendance_report_batches
    WHERE zoom_meeting_uuid = 'z7Synthetic/Occurrence/B==' AND status = 'complete'
    ORDER BY seq DESC LIMIT 1),
  'a7a7a7a7-8888-0000-0000-000000000001'::uuid,
  '[Z7-R2.2/R2.4] the previous complete batch remains the effective authority');

SELECT throws_ok(
  $$ UPDATE zoom_internal.zoom_attendance_report_batches
        SET status = 'rejected', rejection_reason = 'illegal demotion'
      WHERE id = 'a7a7a7a7-8888-0000-0000-000000000001' $$,
  'P0409', NULL,
  '[Z7-R2.2] the database refuses complete→rejected even to a table-privileged writer');

SELECT throws_ok(
  $$ UPDATE zoom_internal.zoom_attendance_report_batches
        SET updated_at = now()
      WHERE id = 'a7a7a7a7-8888-0000-0000-000000000001' $$,
  'P0409', NULL,
  '[Z7-R2.2] COMPLETE is terminal: even a same-status rewrite is refused');

-- B4 — an unknown batch id.
SELECT is(
  zoom_internal.promote_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-00000000dead', '[]'::jsonb, 100, 1, 0, '2026-07-30T03:00:00Z'),
  'batch_not_found',
  'B4: an unknown candidate is batch_not_found');

RESET ROLE;

-- B5 — a rejected batch stays rejected: promotion refuses it too.
UPDATE zoom_internal.zoom_attendance_report_batches
   SET status = 'rejected', rejection_reason = 'row_count_mismatch'
 WHERE id = 'a7a7a7a7-8888-0000-0000-000000000002';

SET LOCAL ROLE service_role;
SELECT is(
  zoom_internal.promote_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000002', '[]'::jsonb, 100, 1, 0, '2026-07-30T03:00:00Z'),
  'batch_not_pending',
  'B5: a rejected candidate can never become authoritative');
RESET ROLE;

SELECT throws_ok(
  $$ UPDATE zoom_internal.zoom_attendance_report_batches
        SET status = 'complete', total_records = 0, row_count = 0
      WHERE id = 'a7a7a7a7-8888-0000-0000-000000000002' $$,
  'P0409', NULL,
  '[Z7-R2.2] the database refuses rejected→complete');

SELECT throws_ok(
  $$ UPDATE zoom_internal.zoom_attendance_report_batches
        SET rejection_reason = 'rewritten reason'
      WHERE id = 'a7a7a7a7-8888-0000-0000-000000000002' $$,
  'P0409', NULL,
  '[Z7-R2.2] REJECTED is terminal: its reason cannot be rewritten');

SET LOCAL ROLE service_role;
SELECT is(
  zoom_internal.reject_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000003', 'page_fetch_failed'),
  'rejected',
  '[Z7-R2.2] a pending fetch failure resolves once to rejected');
SELECT is(
  zoom_internal.reject_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000003', 'second reason'),
  'batch_not_pending',
  '[Z7-R2.2] a second rejection is refused instead of rewriting the terminal batch');
SELECT is(
  zoom_internal.promote_attendance_report_batch(
    'a7a7a7a7-8888-0000-0000-000000000003', '[]'::jsonb, 100, 1, 0, '2026-07-30T03:00:00Z'),
  'batch_not_pending',
  '[Z7-R2.2] a rejected batch cannot be promoted later');
RESET ROLE;

-- B6 — DB-owned authority order: seq is monotonic in creation order, so the
-- effective-set rule ("highest-seq complete") needs no client clock.
SELECT ok(
  (SELECT b2.seq > b1.seq
     FROM zoom_internal.zoom_attendance_report_batches b1,
          zoom_internal.zoom_attendance_report_batches b2
    WHERE b1.id = 'a7a7a7a7-8888-0000-0000-000000000001'
      AND b2.id = 'a7a7a7a7-8888-0000-0000-000000000002'),
  'B6: batch seq is database-assigned and monotonic — authority never reads report_fetched_at');

-- B7 — the report-row CHECKs: source and batch reference agree by construction.
SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid, matched_by,
        joined_at, left_at, source, report_batch_id)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/B==', 'unmatched',
             '2026-07-29T23:56:00Z', '2026-07-30T00:30:00Z', 'report', NULL) $$,
  '23514',
  NULL,
  'B7: a report row without its batch is refused');

SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid, matched_by,
        joined_at, source, report_batch_id)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/B==', 'unmatched',
             '2026-07-29T23:56:00Z', 'webhook', 'a7a7a7a7-8888-0000-0000-000000000001') $$,
  '23514',
  NULL,
  'B7: a webhook row claiming a batch is refused');

SELECT throws_ok(
  $$ INSERT INTO public.zoom_attendance
       (surface_type, surface_id, school_id, zoom_meeting_uuid, matched_by,
        joined_at, left_at, source, report_batch_id)
     VALUES ('consultor_session', 'a7a7a7a7-0000-0000-0000-000000000001', 9901,
             'z7Synthetic/Occurrence/B==', 'unmatched',
             '2026-07-29T23:56:00Z', NULL, 'report', 'a7a7a7a7-8888-0000-0000-000000000001') $$,
  '23514',
  NULL,
  'B7: an OPEN report row is refused — the report arrives paired (§6.2)');

SELECT * FROM finish();

ROLLBACK;
