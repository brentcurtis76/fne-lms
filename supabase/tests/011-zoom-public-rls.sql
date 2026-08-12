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

SELECT plan(83);

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
-- share a surface_id and differ only by surface_type.
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
   'email', now() - interval '40 min', now() - interval '10 min', 'report'),
  ('a7a7a7a7-1111-0000-0000-000000000004', 'consultor_session',
   'a7a7a7a7-c011-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/C==',
   NULL, NULL, 'Asistente Sintetico Sesion', NULL,
   'name', now() - interval '30 min', NULL, 'webhook'),
  ('a7a7a7a7-1111-0000-0000-000000000005', 'community_meeting',
   'a7a7a7a7-c011-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/D==',
   NULL, NULL, 'Asistente Sintetico Reunion', NULL,
   'name', now() - interval '20 min', NULL, 'webhook');

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
     ARRAY['pending', 'provisioned', 'started'], 'z7Occurrence/M1==',
     '2001-01-01T00:00:00Z', NULL)),
  1, 'a replayed meeting.started still applies — duplicate deliveries are not errors');

SELECT is(
  (SELECT actual_started_at FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000001'),
  '2026-07-29T23:55:56Z'::timestamptz,
  'a REPLAYED meeting.started cannot overwrite an instant already recorded');

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
     ARRAY['pending', 'provisioned', 'started', 'ended', 'error'], NULL,
     '2026-07-29T23:55:56Z', '2026-07-30T00:03:26Z')),
  1, 'meeting.ended applies over provisioned — the ended set is the wider one');

SELECT ok(
  (SELECT actual_started_at = '2026-07-29T23:55:56Z'::timestamptz
          AND actual_ended_at = '2026-07-30T00:03:26Z'::timestamptz
          AND zoom_meeting_uuid IS NULL
     FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000002'),
  'an out-of-order meeting.ended records BOTH exact instants — and still captures no occurrence uuid');

-- M2(b) ...and the swept `meeting.started` fifteen minutes later is refused by the
-- guard, so it can neither overwrite the instants nor resurrect a finished meeting.
SELECT is(
  (SELECT count(*)::int FROM zoom_internal.apply_meeting_lifecycle(
     'a7a7a7a7-2222-0000-0000-000000000002', 'started',
     ARRAY['pending', 'provisioned', 'started'], 'z7Occurrence/M2==',
     '2001-01-01T00:00:00Z', NULL)),
  0, 'a swept meeting.started over an ended meeting matches zero rows — the guard refuses it');

SELECT ok(
  (SELECT status = 'ended'
          AND actual_started_at = '2026-07-29T23:55:56Z'::timestamptz
          AND actual_ended_at = '2026-07-30T00:03:26Z'::timestamptz
          AND zoom_meeting_uuid IS NULL
     FROM zoom_internal.zoom_meetings
    WHERE id = 'a7a7a7a7-2222-0000-0000-000000000002'),
  'after the refused replay the row still holds both EXACT fixture instants, unchanged');

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
  'zoom_attendance.participant_uuid exists — the [R3] interval key');
SELECT col_is_null('public', 'zoom_attendance', 'participant_uuid',
  'participant_uuid is nullable — Zoom omits it, and the applier falls back to identity');

-- The index exists, is UNIQUE, and is PARTIAL. All three matter; a total unique index
-- would pass the first two and be wrong.
SELECT is(
  (SELECT count(*)::int FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'zoom_attendance'
      AND indexname = 'zoom_attendance_participant_occurrence_key'),
  1, 'the participant/occurrence unique index exists');

SELECT ok(
  (SELECT indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%WHERE (participant_uuid IS NOT NULL)%'
     FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'zoom_attendance_participant_occurrence_key'),
  'the index is UNIQUE and PARTIAL on participant_uuid IS NOT NULL');

-- Fixtures for the behavioural half. Reuses School A's session from the Z7-1 block.
INSERT INTO public.zoom_attendance
  (id, surface_type, surface_id, school_id, zoom_meeting_uuid,
   participant_uuid, matched_by, joined_at, source)
VALUES
  ('a7a7a7a7-5555-0000-0000-000000000001', 'consultor_session',
   'a7a7a7a7-0000-0000-0000-000000000001', 9901, 'z7Synthetic/Occurrence/P==',
   '364B3A17-05C0-6B63-F4FA-2180DCC26971', 'customer_key',
   '2026-07-29T23:55:56Z', 'webhook');

-- THE REDELIVERY, at the database. Same occurrence, same participant_uuid.
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

SELECT * FROM finish();

ROLLBACK;
