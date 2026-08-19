-- =============================================================================
-- security_audit_events RLS + privilege + constraint suite (pgTAP) — S3
--
-- The table this replaces did not exist, so there is no prior behaviour to
-- preserve and every property below is asserted from scratch. Three families:
--
--   1. PRIVILEGES (layer 1). anon holds nothing; authenticated holds SELECT
--      only; service_role keeps the full set. This is what stops TRUNCATE,
--      which RLS never evaluates and which Supabase's ALTER DEFAULT PRIVILEGES
--      would otherwise grant to both public roles. The grant-set pins read the
--      REAL ACL via `aclexplode(pg_class.relacl)` rather than
--      `information_schema.role_table_grants`, so a PostgreSQL-specific
--      privilege (17's MAINTAIN, and anything a future release adds) is
--      covered rather than invisible.
--
--   2. POLICY (layer 2). Exactly one policy: admin, SELECT-only, TO
--      authenticated, with no WITH CHECK anywhere — so no authenticated role
--      has any write path at all, and a non-admin authenticated role reaches
--      the policy and reads zero rows.
--
--   3. CONSTRAINTS. The privacy floor: the metadata CHECK must refuse a row
--      whose metadata carries a forbidden key, EVEN WHEN INSERTED BY
--      service_role. That is the property that makes the guarantee structural
--      rather than a convention the next call site can forget — the recursive
--      strip in lib/security/audit.ts sits above it, not instead of it.
--
-- Per role x operation, as CLAUDE.md requires. Blocked INSERT throws (42501 at
-- the privilege layer); blocked SELECT for anon throws for the same reason;
-- a non-admin authenticated SELECT returns empty because the grant survives and
-- the policy is what denies.
--
-- Runs inside a transaction and rolls back — safe to run repeatedly against a
-- local database. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(41);

-- -----------------------------------------------------------------------------
-- Fixture ids — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set admin_uid   '''00000000-0000-0000-0000-0000000050aa'''
\set docente_uid '''00000000-0000-0000-0000-0000000050dd'''
\set target_uid  '''00000000-0000-0000-0000-0000000050cc'''
\set seeded_id   '''50000000-0000-0000-0000-000000000001'''

-- =============================================================================
-- Structural
-- =============================================================================
SELECT tests.rls_enabled('public', 'security_audit_events');

SELECT has_table('public', 'security_audit_events', 'security_audit_events: the table exists');

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
      AND p.schemaname = 'public' AND p.tablename = 'security_audit_events'),
  'security_audit_events_admin_select|SELECT|authenticated',
  'security_audit_events: exactly one policy — admin SELECT-only, TO authenticated'
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
      AND p.tablename = 'security_audit_events'
      AND p.with_check IS NOT NULL),
  0,
  'security_audit_events: no policy carries a WITH CHECK — no authenticated write path exists'
);

-- The typed action set. Pinned here because the TypeScript union in
-- lib/security/audit.ts mirrors it by hand; this is the SQL half of that pair.
SELECT ok(
  (SELECT pg_get_constraintdef(c.oid)
     FROM pg_constraint c
    WHERE c.conrelid = 'public.security_audit_events'::regclass
      AND c.conname = 'security_audit_events_action_check') LIKE '%password_reset_admin%',
  'security_audit_events: the action CHECK constrains the operation to the typed set'
);

SELECT ok(
  (SELECT count(*)::int
     FROM pg_index i
    WHERE i.indrelid = 'public.security_audit_events'::regclass) >= 4,
  'security_audit_events: primary key plus the three triage indexes are present'
);

-- =============================================================================
-- Layer 1 — privileges, read off the real ACL
-- =============================================================================
SELECT is(
  (SELECT coalesce(string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type), '(none)')
     FROM pg_class c
     CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid = 'public.security_audit_events'::regclass
      AND a.grantee = 'anon'::regrole::oid),
  '(none)',
  'anon: the ACL carries no entry — every privilege the server defines is revoked'
);

SELECT is(
  (SELECT coalesce(string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type), '(none)')
     FROM pg_class c
     CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid = 'public.security_audit_events'::regclass
      AND a.grantee = 'authenticated'::regrole::oid),
  'SELECT',
  'authenticated: the ACL carries exactly {SELECT} — nothing else, whatever this server version defines'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.security_audit_events', 'TRUNCATE'),
  'anon: no TRUNCATE privilege (RLS would not govern it)'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.security_audit_events', 'TRUNCATE'),
  'authenticated: no TRUNCATE privilege — an admin cannot empty its own audit trail'
);

-- MAINTAIN (PostgreSQL 17+) is why the migration uses a grant-list rather than
-- an enumerated REVOKE. Probed under a version guard: `has_table_privilege`
-- raises on an unknown privilege name below 17.
CREATE OR REPLACE FUNCTION pg_temp.audit_lacks_maintain(role_name text) RETURNS boolean AS $$
BEGIN
  RETURN NOT has_table_privilege(role_name, 'public.security_audit_events', 'MAINTAIN');
END;
$$ LANGUAGE plpgsql;

SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN ok(pg_temp.audit_lacks_maintain('anon'), 'anon: no MAINTAIN privilege (PostgreSQL 17+)')
  ELSE skip('MAINTAIN does not exist below PostgreSQL 17 (server is '
            || current_setting('server_version') || ') — REVOKE ALL covers it on upgrade', 1)
END;

SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN ok(pg_temp.audit_lacks_maintain('authenticated'),
          'authenticated: no MAINTAIN privilege (PostgreSQL 17+)')
  ELSE skip('MAINTAIN does not exist below PostgreSQL 17 (server is '
            || current_setting('server_version') || ') — REVOKE ALL covers it on upgrade', 1)
END;

SELECT ok(
  has_table_privilege('service_role', 'public.security_audit_events', 'SELECT')
    AND has_table_privilege('service_role', 'public.security_audit_events', 'INSERT')
    AND has_table_privilege('service_role', 'public.security_audit_events', 'UPDATE')
    AND has_table_privilege('service_role', 'public.security_audit_events', 'DELETE'),
  'service_role: CRUD untouched by the REVOKEs — the only write path survives'
);

-- -----------------------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS).
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:admin_uid::uuid,   'admin@audit-rls.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:docente_uid::uuid, 'docente@audit-rls.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:target_uid::uuid,  'target@audit-rls.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status)
VALUES
  (:admin_uid::uuid,   'admin@audit-rls.local',   'RLS Audit Admin',   'approved'),
  (:docente_uid::uuid, 'docente@audit-rls.local', 'RLS Audit Docente', 'approved'),
  (:target_uid::uuid,  'target@audit-rls.local',  'RLS Audit Target',  'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name)
VALUES (9501, 'RLS Audit Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES
  (:admin_uid::uuid,   'admin',   NULL, true),
  (:docente_uid::uuid, 'docente', 9501, true)
ON CONFLICT DO NOTHING;

INSERT INTO security_audit_events (id, action, outcome, actor_user_id, target_user_id, school_id, metadata)
VALUES (
  :seeded_id::uuid, 'password_reset_admin', 'success',
  :admin_uid::uuid, :target_uid::uuid, 9501,
  '{"requester_role": "admin"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Role impersonation helpers.
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
-- Tier 1 — authenticated admin: SELECT only
-- =============================================================================
SELECT pg_temp.set_authenticated(:admin_uid::uuid);

SELECT results_eq(
  $$ SELECT count(*)::int FROM security_audit_events
      WHERE id = '50000000-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1],
  'admin: SELECT allowed — sees the seeded event'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome)
       VALUES ('password_reset_admin', 'success') $$,
  '42501',
  'permission denied for table security_audit_events',
  'admin: INSERT denied at the privilege layer — an admin cannot forge an audit row'
);

SELECT throws_ok(
  $$ UPDATE security_audit_events SET outcome = 'failure'
      WHERE id = '50000000-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table security_audit_events',
  'admin: UPDATE denied — the trail is append-only to every exposed role'
);

SELECT throws_ok(
  $$ DELETE FROM security_audit_events
      WHERE id = '50000000-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table security_audit_events',
  'admin: DELETE denied — an admin cannot erase the record of their own actions'
);

SELECT throws_ok(
  $$ TRUNCATE security_audit_events $$,
  '42501',
  'permission denied for table security_audit_events',
  'admin: TRUNCATE denied — the command RLS never sees is stopped by the revoked grant'
);

RESET ROLE;

-- =============================================================================
-- Tier 2 — docente: reaches the policy, reads nothing, writes nothing
-- =============================================================================
SELECT pg_temp.set_authenticated(:docente_uid::uuid);

SELECT is_empty(
  $$ SELECT 1 FROM security_audit_events
      WHERE id = '50000000-0000-0000-0000-000000000001'::uuid $$,
  'docente: SELECT reaches the policy and returns 0 rows'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome)
       VALUES ('role_assigned', 'success') $$,
  '42501',
  'permission denied for table security_audit_events',
  'docente: INSERT denied at the privilege layer'
);

SELECT throws_ok(
  $$ UPDATE security_audit_events SET outcome = 'denied'
      WHERE id = '50000000-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table security_audit_events',
  'docente: UPDATE denied at the privilege layer'
);

SELECT throws_ok(
  $$ DELETE FROM security_audit_events
      WHERE id = '50000000-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  'permission denied for table security_audit_events',
  'docente: DELETE denied at the privilege layer'
);

SELECT throws_ok(
  $$ TRUNCATE security_audit_events $$,
  '42501',
  'permission denied for table security_audit_events',
  'docente: TRUNCATE denied at the privilege layer'
);

-- The target of an event cannot read it either: this is not a "your data" table.
RESET ROLE;
SELECT pg_temp.set_authenticated(:target_uid::uuid);

SELECT is_empty(
  $$ SELECT 1 FROM security_audit_events
      WHERE target_user_id = '00000000-0000-0000-0000-0000000050cc'::uuid $$,
  'the target of an event: sees 0 rows — being audited is not a read grant'
);

RESET ROLE;

-- =============================================================================
-- Tier 3 — anon: nothing at all, SELECT included
-- =============================================================================
SELECT pg_temp.set_anon();

SELECT throws_ok(
  $$ SELECT 1 FROM security_audit_events $$,
  '42501',
  'permission denied for table security_audit_events',
  'anon: SELECT denied at the privilege layer (never reaches the policy)'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome)
       VALUES ('role_assigned', 'success') $$,
  '42501',
  'permission denied for table security_audit_events',
  'anon: INSERT denied at the privilege layer'
);

SELECT throws_ok(
  $$ UPDATE security_audit_events SET outcome = 'denied' $$,
  '42501',
  'permission denied for table security_audit_events',
  'anon: UPDATE denied at the privilege layer'
);

SELECT throws_ok(
  $$ DELETE FROM security_audit_events $$,
  '42501',
  'permission denied for table security_audit_events',
  'anon: DELETE denied at the privilege layer'
);

SELECT throws_ok(
  $$ TRUNCATE security_audit_events $$,
  '42501',
  'permission denied for table security_audit_events',
  'anon: TRUNCATE denied at the privilege layer'
);

RESET ROLE;

-- =============================================================================
-- Tier 4 — service_role: the only write path, and the constraints it obeys
-- =============================================================================
SELECT pg_temp.set_service_role();

SELECT lives_ok(
  $$ INSERT INTO security_audit_events (action, outcome, actor_user_id, target_user_id, metadata)
       VALUES ('invitation_resent', 'success',
               '00000000-0000-0000-0000-0000000050aa'::uuid,
               '00000000-0000-0000-0000-0000000050cc'::uuid,
               '{"delivery": "resend", "email_domain": "example.com"}'::jsonb) $$,
  'service_role: INSERT allowed — the only write path'
);

SELECT lives_ok(
  $$ INSERT INTO security_audit_events (action, outcome)
       VALUES ('password_change_voluntary', 'success') $$,
  'service_role: a system event with no actor and no target is legal'
);

SELECT ok(
  (SELECT max(occurred_at) FROM security_audit_events) > now() - interval '1 minute',
  'occurred_at defaults to now() — the caller never supplies the timestamp'
);

-- The typed action set.
SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome)
       VALUES ('whatever_the_caller_felt_like', 'success') $$,
  '23514',
  NULL,
  'service_role: an unknown action violates the action CHECK — no untyped category can appear'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome)
       VALUES ('password_reset_admin', 'probably_fine') $$,
  '23514',
  NULL,
  'service_role: an unknown outcome violates the outcome CHECK'
);

-- =============================================================================
-- The privacy floor. These are the assertions that make the guarantee
-- structural: even the ONE role that can write here cannot write a secret.
-- =============================================================================
SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('password_reset_admin', 'success', '{"password": "anything"}'::jsonb) $$,
  '23514',
  NULL,
  'metadata CHECK: a `password` key is refused even for service_role'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('password_reset_admin', 'success', '{"temporary_password": "anything"}'::jsonb) $$,
  '23514',
  NULL,
  'metadata CHECK: a `temporary_password` key is refused'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('invitation_sent', 'success', '{"action_link": "anything"}'::jsonb) $$,
  '23514',
  NULL,
  'metadata CHECK: an `action_link` key is refused — a recovery URL never lands here'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('invitation_sent', 'success', '{"token_hash": "anything"}'::jsonb) $$,
  '23514',
  NULL,
  'metadata CHECK: a `token_hash` key is refused'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('user_email_changed', 'success', '{"email": "anyone@example.com"}'::jsonb) $$,
  '23514',
  NULL,
  'metadata CHECK: an `email` key is refused — addresses do not get a second, unmanaged copy'
);

SELECT lives_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('user_email_changed', 'success',
               '{"from_email_domain": "example.com", "to_email_domain": "example.net"}'::jsonb) $$,
  'metadata CHECK: e-mail DOMAINS are allowed — the security signal without the identity'
);

SELECT throws_ok(
  $$ INSERT INTO security_audit_events (action, outcome, metadata)
       VALUES ('password_reset_admin', 'success', '["not", "an", "object"]'::jsonb) $$,
  '23514',
  NULL,
  'metadata CHECK: a non-object metadata value is refused'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
