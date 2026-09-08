-- =============================================================================
-- user_roles one-active-supervisor uniqueness (pgTAP) — B2a correction round
--
-- Migration 20260827150000_one_active_supervisor.sql adds the partial unique
-- index uq_user_roles_one_active_supervisor: at most ONE row per user with
-- role_type = 'supervisor_de_red' AND is_active = true. The application-layer
-- checks in pages/api/admin/networks/supervisors.ts and
-- utils/roleUtils.ts::assignSupervisorRole are look-before-insert and therefore
-- racy under concurrent requests; this index is the authoritative enforcement
-- of one-active-network-per-supervisor. scripts/ci/supervisor-concurrency-proof.mjs
-- exercises the actual race on two live sessions; this suite pins the
-- constraint's shape and reach:
--
--   1. the index exists and is UNIQUE;
--   2. a SECOND active supervisor row for the same user is rejected (23505),
--      whether it points at another network or duplicates the same one;
--   3. INACTIVE historical rows stay unlimited (is_active = false, and NULL,
--      which the partial predicate deliberately treats as not-active);
--   4. different users are unaffected.
--
-- Synthetic fixtures only (Ley 21.719): invented uuids, reserved test domain.
-- Runs inside a transaction and rolls back — safe to repeat, never production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

-- -----------------------------------------------------------------------------
-- Fixture UUIDs — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set creator_uid  '''00000000-0000-0000-0000-0000000b2a00'''
\set user_a_uid   '''00000000-0000-0000-0000-0000000b2a01'''
\set user_b_uid   '''00000000-0000-0000-0000-0000000b2a02'''
\set red_1_uid    '''00000000-0000-0000-0000-0000000b2a11'''
\set red_2_uid    '''00000000-0000-0000-0000-0000000b2a12'''

-- -----------------------------------------------------------------------------
-- Seed the minimum auth + profile + network rows the FKs need.
-- -----------------------------------------------------------------------------

INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:creator_uid::uuid, 'b2a-creator@rls-test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_a_uid::uuid,  'b2a-user-a@rls-test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_b_uid::uuid,  'b2a-user-b@rls-test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, name, approval_status)
VALUES
  (:creator_uid::uuid, 'b2a-creator@rls-test.local', 'B2a Creator Sintetico', 'approved'),
  (:user_a_uid::uuid,  'b2a-user-a@rls-test.local',  'B2a Supervisor A Sintetico', 'approved'),
  (:user_b_uid::uuid,  'b2a-user-b@rls-test.local',  'B2a Supervisor B Sintetico', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.redes_de_colegios (id, nombre, descripcion, created_by)
VALUES
  (:red_1_uid::uuid, 'Red Sintetica pgTAP B2a Uno', 'Red sintetica para pgTAP. No es una red real.', :creator_uid::uuid),
  (:red_2_uid::uuid, 'Red Sintetica pgTAP B2a Dos', 'Red sintetica para pgTAP. No es una red real.', :creator_uid::uuid)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1–2. The index exists and is unique.
-- -----------------------------------------------------------------------------

SELECT has_index(
  'public', 'user_roles', 'uq_user_roles_one_active_supervisor',
  'uq_user_roles_one_active_supervisor exists on public.user_roles'
);

SELECT index_is_unique(
  'public', 'user_roles', 'uq_user_roles_one_active_supervisor',
  'uq_user_roles_one_active_supervisor is a UNIQUE index'
);

-- -----------------------------------------------------------------------------
-- 3–5. One active supervisor row per user, and not one more.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2a01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a11', true)$$,
  'first ACTIVE supervisor row for a user is accepted'
);

SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2a01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a12', true)$$,
  '23505',
  NULL,
  'a second ACTIVE supervisor row for the SAME user pointing at ANOTHER network is rejected'
);

SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2a01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a11', true)$$,
  '23505',
  NULL,
  'a second ACTIVE supervisor row for the SAME user duplicating the SAME network is rejected'
);

-- -----------------------------------------------------------------------------
-- 6–7. Inactive history stays unlimited; NULL is not active.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES
      ('00000000-0000-0000-0000-0000000b2a01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a11', false),
      ('00000000-0000-0000-0000-0000000b2a01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a12', false)$$,
  'INACTIVE historical supervisor rows for the same user remain allowed, plural'
);

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2a01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a12', NULL)$$,
  'a NULL is_active row is outside the partial predicate — treated as not-active, allowed'
);

-- -----------------------------------------------------------------------------
-- 8. A different user is unaffected by user A's active row.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2a02', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2a12', true)$$,
  'a DIFFERENT user may hold their own active supervisor row'
);

SELECT * FROM finish();

ROLLBACK;
