-- =============================================================================
-- user_roles active-supervisor-requires-red CHECK constraint (pgTAP) — B2a r2
--
-- Migration 20260827160000_active_supervisor_requires_red.sql adds the CHECK
-- constraint chk_user_roles_active_supervisor_needs_red:
--
--   role_type <> 'supervisor_de_red'
--   OR is_active IS DISTINCT FROM TRUE
--   OR red_id IS NOT NULL
--
-- It exists because the generic role-assignment path wrote ACTIVE
-- supervisor_de_red rows with red_id NULL; uq_user_roles_one_active_supervisor
-- (suite 060) then counted that row as the user's one active supervisor role
-- and blocked the real, network-scoped grant through Gestión de Redes. The
-- application now refuses the role on the generic endpoint, but only the
-- database can bind EVERY writer. This suite pins the constraint's shape and
-- reach:
--
--   1. the constraint exists as a CHECK on public.user_roles;
--   2. an ACTIVE supervisor row with red_id NULL is rejected (23514) on
--      INSERT, and an inactive NULL-red row cannot be REACTIVATED (23514) —
--      nor can an active row's red_id be stripped to NULL (23514);
--   3. an ACTIVE supervisor row WITH a real red_id is accepted, and its later
--      deactivation is unrestricted;
--   4. inactive (false) and legacy NULL-is_active history keeps NULL red_id
--      freely;
--   5. unrelated role types keep NULL red_id freely even while active.
--
-- Synthetic fixtures only (Ley 21.719): invented uuids, reserved test domain.
-- Runs inside a transaction and rolls back — safe to repeat, never production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(11);

-- -----------------------------------------------------------------------------
-- Fixture UUIDs — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set creator_uid   '''00000000-0000-0000-0000-0000000b2b00'''
\set user_a_uid    '''00000000-0000-0000-0000-0000000b2b01'''
\set user_b_uid    '''00000000-0000-0000-0000-0000000b2b02'''
\set red_1_uid     '''00000000-0000-0000-0000-0000000b2b11'''
\set red_2_uid     '''00000000-0000-0000-0000-0000000b2b12'''
-- Role-row uuids ...b2b21 (dormant NULL-red), ...b2b22 (active network-scoped),
-- ...b2b23 (user B's active row) appear inline inside the dollar-quoted test
-- statements below — psql does not interpolate \set variables there.

-- -----------------------------------------------------------------------------
-- Seed the minimum auth + profile + network rows the FKs need.
-- -----------------------------------------------------------------------------

INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:creator_uid::uuid, 'b2b-creator@rls-test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_a_uid::uuid,  'b2b-user-a@rls-test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_b_uid::uuid,  'b2b-user-b@rls-test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, name, approval_status)
VALUES
  (:creator_uid::uuid, 'b2b-creator@rls-test.local', 'B2b Creator Sintetico', 'approved'),
  (:user_a_uid::uuid,  'b2b-user-a@rls-test.local',  'B2b Supervisor A Sintetico', 'approved'),
  (:user_b_uid::uuid,  'b2b-user-b@rls-test.local',  'B2b Supervisor B Sintetico', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.redes_de_colegios (id, nombre, descripcion, created_by)
VALUES
  (:red_1_uid::uuid, 'Red Sintetica pgTAP B2b Uno', 'Red sintetica para pgTAP. No es una red real.', :creator_uid::uuid),
  (:red_2_uid::uuid, 'Red Sintetica pgTAP B2b Dos', 'Red sintetica para pgTAP. No es una red real.', :creator_uid::uuid)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. The constraint exists as a CHECK on public.user_roles.
-- -----------------------------------------------------------------------------

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'chk_user_roles_active_supervisor_needs_red'
      AND conrelid = 'public.user_roles'::regclass
      AND contype = 'c'
  ),
  'chk_user_roles_active_supervisor_needs_red exists as a CHECK constraint on public.user_roles'
);

-- -----------------------------------------------------------------------------
-- 2–4. An ACTIVE supervisor without a network cannot be created — by INSERT
--       or by reactivating a NULL-red historical row.
-- -----------------------------------------------------------------------------

SELECT throws_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2b01', 'supervisor_de_red', NULL, true)$$,
  '23514',
  NULL,
  'an ACTIVE supervisor_de_red row with red_id NULL is rejected on INSERT'
);

SELECT lives_ok(
  $$INSERT INTO public.user_roles (id, user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2b21', '00000000-0000-0000-0000-0000000b2b01', 'supervisor_de_red', NULL, false)$$,
  'an INACTIVE supervisor row with red_id NULL is accepted (historical shape preserved)'
);

SELECT throws_ok(
  $$UPDATE public.user_roles SET is_active = true
    WHERE id = '00000000-0000-0000-0000-0000000b2b21'$$,
  '23514',
  NULL,
  'REACTIVATING a NULL-red historical supervisor row is rejected — the UPDATE path is guarded too'
);

-- -----------------------------------------------------------------------------
-- 5–6. The correct shape works: active WITH a network, and stripping the
--       network from an active row is refused.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$INSERT INTO public.user_roles (id, user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2b22', '00000000-0000-0000-0000-0000000b2b01', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2b11', true)$$,
  'an ACTIVE supervisor row WITH a valid red_id is accepted'
);

SELECT throws_ok(
  $$UPDATE public.user_roles SET red_id = NULL
    WHERE id = '00000000-0000-0000-0000-0000000b2b22'$$,
  '23514',
  NULL,
  'stripping red_id from an ACTIVE supervisor row is rejected'
);

-- -----------------------------------------------------------------------------
-- 7–8. History stays unlimited: is_active = false and legacy NULL both keep
--       red_id NULL freely.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES
      ('00000000-0000-0000-0000-0000000b2b01', 'supervisor_de_red', NULL, false),
      ('00000000-0000-0000-0000-0000000b2b01', 'supervisor_de_red', NULL, false)$$,
  'INACTIVE supervisor rows with red_id NULL remain allowed, plural'
);

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2b01', 'supervisor_de_red', NULL, NULL)$$,
  'a NULL is_active supervisor row with red_id NULL is outside the invariant — legacy shape allowed'
);

-- -----------------------------------------------------------------------------
-- 9. Unrelated role types are untouched: active rows keep red_id NULL freely.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$INSERT INTO public.user_roles (user_id, role_type, red_id, is_active)
    VALUES
      ('00000000-0000-0000-0000-0000000b2b02', 'docente', NULL, true),
      ('00000000-0000-0000-0000-0000000b2b02', 'admin',   NULL, true)$$,
  'unrelated roles (docente, admin) may be ACTIVE with red_id NULL'
);

-- -----------------------------------------------------------------------------
-- 10–11. Deactivation is unrestricted, and a different user can hold their own
--        properly-scoped active supervisor row.
-- -----------------------------------------------------------------------------

SELECT lives_ok(
  $$UPDATE public.user_roles SET is_active = false
    WHERE id = '00000000-0000-0000-0000-0000000b2b22'$$,
  'deactivating an active supervisor row (red_id kept) is unrestricted'
);

SELECT lives_ok(
  $$INSERT INTO public.user_roles (id, user_id, role_type, red_id, is_active)
    VALUES ('00000000-0000-0000-0000-0000000b2b23', '00000000-0000-0000-0000-0000000b2b02', 'supervisor_de_red', '00000000-0000-0000-0000-0000000b2b12', true)$$,
  'a DIFFERENT user may hold their own ACTIVE network-scoped supervisor row'
);

SELECT * FROM finish();

ROLLBACK;
