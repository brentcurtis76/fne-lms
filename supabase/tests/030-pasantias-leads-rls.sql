-- =============================================================================
-- pasantias_leads RLS + constraint test suite (pgTAP) — INSPIRA A2
--
-- The table backs the public Pasantías INSPIRA lead form. Per frozen decision
-- D-04 (amended 2026-07-31) the access posture is PER-OPERATION and enforced in
-- TWO layers, so this suite asserts PRIVILEGES as well as POLICIES:
--
--   Layer 1 — GRANTs. anon holds nothing; authenticated holds SELECT only;
--     service_role keeps the full set. This is what stops TRUNCATE, which RLS
--     never evaluates and which Supabase's default privileges would otherwise
--     grant to both public roles.
--
--     The grant-set pins read the REAL ACL — `aclexplode(pg_class.relacl)` —
--     not `information_schema.role_table_grants`. The information_schema views
--     are SQL-standard and therefore report only standard privileges: a
--     PostgreSQL-specific one is invisible there, which is exactly how the
--     earlier pin failed to notice that PostgreSQL 17's `MAINTAIN` was not
--     covered by an enumerated REVOKE. Asserting over the ACL makes the pins
--     total: any privilege the server knows about, present or future, shows up.
--     `MAINTAIN` itself is additionally probed under a server-version guard,
--     since it does not exist below PostgreSQL 17 and `has_table_privilege`
--     errors on an unknown privilege name. The guard is what makes the suite
--     portable across both servers this project actually runs on: the local
--     and CI stacks are PostgreSQL 17.6 (the Supabase CLI's default image —
--     `supabase/config.toml` pins no `[db] major_version`), where the probes
--     run live; the hosted production database is 15.8, where they skip.
--   Layer 2 — the single RLS policy, which decides which rows the surviving
--     authenticated SELECT may read (admin only).
--
--   1. authenticated admin → SELECT only. INSERT/UPDATE/DELETE/TRUNCATE are
--      denied at the privilege layer, so they raise 42501 "permission denied
--      for table" — a stricter failure than the RLS-empty result they would
--      produce if the grant survived, and the reason the repo's usual
--      "blocked UPDATE returns empty" convention does not apply here.
--   2. any other authenticated role (docente) → SELECT reaches the policy and
--      returns 0 rows; every write command is denied at the privilege layer.
--   3. anon → nothing at all: every command, including SELECT, raises 42501.
--   4. service_role → the only write path (BYPASSRLS + full grants), used
--      exclusively by guarded API routes.
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

SELECT plan(32);

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
      -- PERMISSIVE only. Every row-secured table in `public` also carries the
      -- RESTRICTIVE `forced_password_change_guard`
      -- (20260819120200_forced_password_change_data_layer.sql), which is ANDed
      -- with whatever is here and can only ever NARROW access. What this
      -- assertion is about is what GRANTS access, and a restrictive policy never
      -- does. `supabase/tests/053-...` asserts the guard is present on this table
      -- and every other one.
    WHERE p.permissive = 'PERMISSIVE'
      AND p.schemaname = 'public' AND p.tablename = 'pasantias_leads'),
  'pasantias_leads_admin_select|SELECT|authenticated',
  'pasantias_leads: exactly one policy — admin SELECT-only, TO authenticated'
);

SELECT is(
  (SELECT count(*)::int
     FROM pg_policies p
      -- PERMISSIVE only. Every row-secured table in `public` also carries the
      -- RESTRICTIVE `forced_password_change_guard`
      -- (20260819120200_forced_password_change_data_layer.sql), which is ANDed
      -- with whatever is here and can only ever NARROW access. What this
      -- assertion is about is what GRANTS access, and a restrictive policy never
      -- does. `supabase/tests/053-...` asserts the guard is present on this table
      -- and every other one.
    WHERE p.permissive = 'PERMISSIVE'
      AND p.schemaname = 'public'
      AND p.tablename = 'pasantias_leads'
      AND p.with_check IS NOT NULL),
  0,
  'pasantias_leads: no policy carries a WITH CHECK — no authenticated write path exists'
);

-- -----------------------------------------------------------------------------
-- [A2 / D-04 amended] Privilege layer. RLS never evaluates TRUNCATE, and
-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new public tables to anon
-- and authenticated — so the migration's grant-list, not the policy, is what
-- stops either role from emptying the table. Asserted from the real ACL first,
-- then behaviorally per role below.
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT coalesce(string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type), '(none)')
     FROM pg_class c
     CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid = 'public.pasantias_leads'::regclass
      AND a.grantee = 'anon'::regrole::oid),
  '(none)',
  'anon: the ACL carries no entry for it — every privilege the server defines, standard or not, is revoked'
);

SELECT is(
  (SELECT coalesce(string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type), '(none)')
     FROM pg_class c
     CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid = 'public.pasantias_leads'::regclass
      AND a.grantee = 'authenticated'::regrole::oid),
  'SELECT',
  'authenticated: the ACL carries exactly {SELECT} — nothing else is granted, whatever privileges this server version defines'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.pasantias_leads', 'TRUNCATE'),
  'anon: no TRUNCATE privilege (RLS would not govern it)'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.pasantias_leads', 'TRUNCATE'),
  'authenticated: no TRUNCATE privilege (RLS would not govern it)'
);

-- MAINTAIN (PostgreSQL 17+) — the privilege that motivated the grant-list form.
-- Wrapped in plpgsql so the call is evaluated only when the CASE branch is
-- taken: `has_table_privilege` raises "unrecognized privilege type" on servers
-- below 17, where the privilege simply does not exist. On the local/CI stack
-- (17.6) these two run live; against the 15.8 production server they skip.
CREATE OR REPLACE FUNCTION pg_temp.lacks_maintain(role_name text) RETURNS boolean AS $$
BEGIN
  RETURN NOT has_table_privilege(role_name, 'public.pasantias_leads', 'MAINTAIN');
END;
$$ LANGUAGE plpgsql;

SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN ok(
         pg_temp.lacks_maintain('anon'),
         'anon: no MAINTAIN privilege (PostgreSQL 17+)'
       )
  ELSE skip(
         'MAINTAIN does not exist below PostgreSQL 17 (server is '
           || current_setting('server_version')
           || ') — the grant-list REVOKE ALL covers it on upgrade',
         1
       )
END;

SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN ok(
         pg_temp.lacks_maintain('authenticated'),
         'authenticated: no MAINTAIN privilege (PostgreSQL 17+)'
       )
  ELSE skip(
         'MAINTAIN does not exist below PostgreSQL 17 (server is '
           || current_setting('server_version')
           || ') — the grant-list REVOKE ALL covers it on upgrade',
         1
       )
END;

SELECT ok(
  has_table_privilege('service_role', 'public.pasantias_leads', 'SELECT')
    AND has_table_privilege('service_role', 'public.pasantias_leads', 'INSERT')
    AND has_table_privilege('service_role', 'public.pasantias_leads', 'UPDATE')
    AND has_table_privilege('service_role', 'public.pasantias_leads', 'DELETE'),
  'service_role: CRUD privileges untouched by the REVOKEs — the only write path survives'
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
  'permission denied for table pasantias_leads',
  'admin: INSERT denied at the privilege layer (no INSERT grant, no WITH CHECK policy)'
);

SELECT throws_ok(
  $$ UPDATE pasantias_leads SET status = 'contacted'
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'admin: UPDATE denied at the privilege layer'
);

SELECT throws_ok(
  $$ DELETE FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'admin: DELETE denied at the privilege layer'
);

-- The exact bypass Codex probed: RLS does not apply to TRUNCATE, so only the
-- revoked grant stops an authenticated session from emptying the table.
SELECT throws_ok(
  $$ TRUNCATE pasantias_leads $$,
  '42501',
  'permission denied for table pasantias_leads',
  'admin: TRUNCATE denied — the SELECT-only posture survives a command RLS never sees'
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
  'permission denied for table pasantias_leads',
  'docente: INSERT denied at the privilege layer'
);

SELECT throws_ok(
  $$ UPDATE pasantias_leads SET status = 'converted'
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'docente: UPDATE denied at the privilege layer'
);

SELECT throws_ok(
  $$ DELETE FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'docente: DELETE denied at the privilege layer'
);

RESET ROLE;

-- =============================================================================
-- Tier 3 — anon: no policy applies to it AND it holds no privilege, so every
-- command is denied outright. Full per-operation matrix, TRUNCATE included.
-- =============================================================================
SELECT pg_temp.set_anon();

SELECT throws_ok(
  $$ SELECT 1 FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'anon: SELECT denied at the privilege layer (never reaches the policy)'
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
  'permission denied for table pasantias_leads',
  'anon: INSERT denied at the privilege layer'
);

SELECT throws_ok(
  $$ UPDATE pasantias_leads SET status = 'dismissed'
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'anon: UPDATE denied at the privilege layer'
);

SELECT throws_ok(
  $$ DELETE FROM pasantias_leads
      WHERE id = '66666666-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table pasantias_leads',
  'anon: DELETE denied at the privilege layer'
);

SELECT throws_ok(
  $$ TRUNCATE pasantias_leads $$,
  '42501',
  'permission denied for table pasantias_leads',
  'anon: TRUNCATE denied — the command RLS never sees is stopped by the revoked grant'
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
