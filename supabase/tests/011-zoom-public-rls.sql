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

SELECT plan(18);

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

SELECT * FROM finish();

ROLLBACK;
