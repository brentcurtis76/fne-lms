-- =============================================================================
-- pasantias_leads RLS + constraint test suite (pgTAP) — INSPIRA A2
--
-- The table backs the public Pasantías INSPIRA lead form. Per frozen decision
-- D-04 the access posture is PER-OPERATION, not per-table:
--
--   1. authenticated admin → SELECT only. INSERT throws 42501; UPDATE and
--      DELETE match 0 rows (repo convention: blocked INSERT throws, blocked
--      UPDATE/DELETE return empty).
--   2. any other authenticated role (docente) → nothing at all.
--   3. anon → nothing (the single policy is TO authenticated).
--   4. service_role → the only write path (BYPASSRLS), used exclusively by
--      guarded API routes.
--
-- It also pins the D-12 split-consent contract at the storage layer: the
-- required processing-consent columns have no defaults, and the optional
-- marketing evidence is all-or-nothing.
--
-- Runs inside a transaction and rolls back — safe to run repeatedly against a
-- local database. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(21);

-- -----------------------------------------------------------------------------
-- Fixture ids — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set admin_uid   '''00000000-0000-0000-0000-000000003aaa'''
\set docente_uid '''00000000-0000-0000-0000-000000003ddd'''
\set seeded_id   '''66666666-0000-0000-0000-000000000001'''

-- -----------------------------------------------------------------------------
-- Structural checks (as postgres, before any role switching).
-- -----------------------------------------------------------------------------
SELECT tests.rls_enabled('public', 'pasantias_leads');

-- [A2] Exactly ONE policy: admin, SELECT-only, TO authenticated. Asserted from
-- pg_policies rather than pgTAP's policy_* helpers so the check does not depend
-- on the installed pgTAP version.
SELECT is(
  (SELECT coalesce(
            string_agg(
              p.policyname || '|' || p.cmd || '|' || array_to_string(p.roles::text[], ','),
              '; ' ORDER BY p.policyname
            ),
            '(none)')
     FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'pasantias_leads'),
  'pasantias_leads_admin_select|SELECT|authenticated',
  'pasantias_leads: exactly one policy — admin SELECT-only, TO authenticated'
);

SELECT is(
  (SELECT count(*)::int
     FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'pasantias_leads'
      AND p.with_check IS NOT NULL),
  0,
  'pasantias_leads: no policy carries a WITH CHECK — no authenticated write path exists'
);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as postgres, bypassing RLS).
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:admin_uid::uuid,   'admin@leads-rls.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:docente_uid::uuid, 'docente@leads-rls.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status)
VALUES
  (:admin_uid::uuid,   'admin@leads-rls.local',   'RLS Leads Admin',   'approved'),
  (:docente_uid::uuid, 'docente@leads-rls.local', 'RLS Leads Docente', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name)
VALUES (9301, 'RLS Leads Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES
  (:admin_uid::uuid,   'admin',   NULL, true),
  (:docente_uid::uuid, 'docente', 9301, true)
ON CONFLICT DO NOTHING;

-- One lead with processing consent only (the D-12 default posture).
INSERT INTO pasantias_leads (
  id, cohort, first_name, last_name, email, email_normalized, institution,
  num_people, status, consent_accepted_at, consent_notice_version
)
VALUES (
  :seeded_id::uuid, 'oct-2026', 'Sofía', 'Prueba',
  'sofia@leads-rls.local', 'sofia@leads-rls.local', 'Colegio de Prueba',
  2, 'new', now(), 'v1'
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helpers: impersonate an authenticated user / anon / service_role.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.set_authenticated(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.set_service_role() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Tier 1 — authenticated admin: SELECT only (D-04)
-- =============================================================================
SELECT pg_temp.set_authenticated(:admin_uid::uuid);

SELECT results_eq(
  $$ SELECT count(*)::int FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1],
  'admin: SELECT allowed — sees the seeded lead'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version
     ) VALUES (
       'oct-2026', 'Admin', 'Intento', 'admin-insert@leads-rls.local',
       'admin-insert@leads-rls.local', 'Colegio de Prueba', now(), 'v1'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "pasantias_leads"',
  'admin: INSERT throws RLS violation (no WITH CHECK policy exists)'
);

SELECT is_empty(
  $$ UPDATE pasantias_leads SET status = 'contacted'
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid
      RETURNING 1 $$,
  'admin: UPDATE matches 0 rows (blocked UPDATE returns empty)'
);

SELECT is_empty(
  $$ DELETE FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid
      RETURNING 1 $$,
  'admin: DELETE matches 0 rows'
);

RESET ROLE;

-- =============================================================================
-- Tier 2 — docente: no access path at all
-- =============================================================================
SELECT pg_temp.set_authenticated(:docente_uid::uuid);

SELECT is_empty(
  $$ SELECT 1 FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  'docente: sees 0 lead rows'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version
     ) VALUES (
       'oct-2026', 'Hack', 'Intento', 'hack@leads-rls.local',
       'hack@leads-rls.local', 'Colegio de Prueba', now(), 'v1'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "pasantias_leads"',
  'docente: INSERT throws RLS violation'
);

SELECT is_empty(
  $$ UPDATE pasantias_leads SET status = 'converted'
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid
      RETURNING 1 $$,
  'docente: UPDATE matches 0 rows'
);

SELECT is_empty(
  $$ DELETE FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid
      RETURNING 1 $$,
  'docente: DELETE matches 0 rows'
);

RESET ROLE;

-- =============================================================================
-- Tier 3 — anon: the policy is TO authenticated, so anon has nothing
-- =============================================================================
SELECT pg_temp.set_anon();

SELECT is_empty(
  $$ SELECT 1 FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  'anon: sees 0 lead rows'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version
     ) VALUES (
       'oct-2026', 'Anon', 'Intento', 'anon@leads-rls.local',
       'anon@leads-rls.local', 'Colegio de Prueba', now(), 'v1'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "pasantias_leads"',
  'anon: INSERT throws RLS violation'
);

RESET ROLE;

-- =============================================================================
-- Tier 4 — service_role: the only write path, and the constraints it must obey
-- =============================================================================
SELECT pg_temp.set_service_role();

SELECT lives_ok(
  $$ INSERT INTO pasantias_leads (
       id, cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version,
       marketing_opt_in, marketing_opt_in_at, marketing_notice_version
     ) VALUES (
       '66666666-0000-0000-0000-000000000002'::uuid, 'oct-2026', 'Pedro', 'Prueba',
       'pedro@leads-rls.local', 'pedro@leads-rls.local', 'Colegio de Prueba',
       now(), 'v1', true, now(), 'v1'
     ) $$,
  'service_role: INSERT allowed (with full marketing opt-in evidence)'
);

-- [D-12] Processing consent has no default: both columns must be supplied.
SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_notice_version
     ) VALUES (
       'oct-2026', 'Sin', 'Consentimiento', 'sinconsent@leads-rls.local',
       'sinconsent@leads-rls.local', 'Colegio de Prueba', 'v1'
     ) $$,
  '23502',
  NULL,
  'service_role: INSERT without consent_accepted_at violates NOT NULL (no default asserts consent)'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at
     ) VALUES (
       'oct-2026', 'Sin', 'Version', 'sinversion@leads-rls.local',
       'sinversion@leads-rls.local', 'Colegio de Prueba', now()
     ) $$,
  '23502',
  NULL,
  'service_role: INSERT without consent_notice_version violates NOT NULL'
);

-- [D-12] Marketing evidence is all-or-nothing, both directions.
SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version, marketing_opt_in
     ) VALUES (
       'oct-2026', 'Optin', 'SinPrueba', 'optin-noevidence@leads-rls.local',
       'optin-noevidence@leads-rls.local', 'Colegio de Prueba', now(), 'v1', true
     ) $$,
  '23514',
  NULL,
  'service_role: marketing_opt_in = true without timestamp/version violates the consent CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version,
       marketing_opt_in, marketing_opt_in_at, marketing_notice_version
     ) VALUES (
       'oct-2026', 'NoOptin', 'ConPrueba', 'nooptin-evidence@leads-rls.local',
       'nooptin-evidence@leads-rls.local', 'Colegio de Prueba', now(), 'v1',
       false, now(), 'v1'
     ) $$,
  '23514',
  NULL,
  'service_role: marketing_opt_in = false with timestamp/version violates the consent CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version
     ) VALUES (
       'oct-2026', 'Mala', 'Normalizacion', '  Mixed@Leads-RLS.local ',
       'Mixed@Leads-RLS.local', 'Colegio de Prueba', now(), 'v1'
     ) $$,
  '23514',
  NULL,
  'service_role: email_normalized that is not lower(btrim(email)) violates the email CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO pasantias_leads (
       cohort, first_name, last_name, email, email_normalized, institution,
       consent_accepted_at, consent_notice_version
     ) VALUES (
       'oct-2026', 'Sofía', 'Duplicada', 'sofia@leads-rls.local',
       'sofia@leads-rls.local', 'Colegio de Prueba', now(), 'v1'
     ) $$,
  '23505',
  NULL,
  'service_role: duplicate (email_normalized, cohort) violates the unique constraint'
);

-- [A1] set_updated_at trigger is wired.
UPDATE pasantias_leads
   SET updated_at = timestamptz '2020-01-01 00:00:00+00'
 WHERE id = '66666666-0000-0000-0000-000000000002'::uuid;

SELECT ok(
  (SELECT updated_at > timestamptz '2020-01-02 00:00:00+00'
     FROM pasantias_leads
    WHERE id = '66666666-0000-0000-0000-000000000002'::uuid),
  'pasantias_leads: set_updated_at trigger refreshes updated_at on UPDATE'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
