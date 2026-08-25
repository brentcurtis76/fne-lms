-- =============================================================================
-- Email marketing schema — RLS, privilege and constraint suite (pgTAP) — INSPIRA B3
--
-- Five tables back the admin-only "Correos" platform. Per frozen decision D-04
-- the access posture is PER-OPERATION and identical on all five, enforced in
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
--     PostgreSQL-specific one is invisible there, which is exactly how A2's
--     first pin failed to notice that PostgreSQL 17's `MAINTAIN` was not
--     covered by an enumerated REVOKE. Asserting over the ACL makes the pins
--     total: any privilege the server knows about, present or future, shows up.
--     The pins compare the whole ACL tuple, not just the privilege name:
--     grantability (`is_grantable`) and the inherited `PUBLIC` grantee are both
--     asserted, because a privilege can be widened without its name changing
--     (WITH GRANT OPTION) and can reach anon without ever appearing in anon's
--     own ACL rows (a grant to PUBLIC).
--     `MAINTAIN` itself is additionally probed under a server-version guard,
--     since it does not exist below PostgreSQL 17 and `has_table_privilege`
--     errors on an unknown privilege name. The guard is what makes the suite
--     portable across both servers this project actually runs on: the local and
--     CI stacks are PostgreSQL 17.6, where the probes run live; the hosted
--     production database is 15.8, where they skip.
--   Layer 2 — one RLS policy per table, which decides which rows the surviving
--     authenticated SELECT may read (admin only).
--
--   1. authenticated admin → SELECT only. INSERT/UPDATE/DELETE/TRUNCATE are
--      denied at the privilege layer, so they raise 42501 "permission denied
--      for table" — a stricter failure than the RLS-empty result they would
--      produce if the grant survived, and the reason the repo's usual "blocked
--      UPDATE returns empty" convention does not apply here. D-04 calls out
--      DELETE on the suppression tombstones and on the contacts themselves;
--      both are asserted, along with the other three tables.
--   2. any other authenticated role (docente) → SELECT reaches the policy and
--      returns 0 rows; every write command is denied at the privilege layer.
--   3. anon → nothing at all: every command, including SELECT, raises 42501.
--   4. service_role → the only write path (BYPASSRLS + full grants), used
--      exclusively by guarded API routes and the B4a/B4b RPCs.
--
-- It also pins the storage-layer contracts the later phases depend on: the
-- two-shape identity CHECK that makes a partial anonymization uncommittable
-- (D-06), the consent/basis columns that carry no defaults (D-12), the status
-- CHECKs (D-07 — note the absence of a `failed` campaign status), the
-- ON DELETE RESTRICT foreign keys that keep send history undeletable (D-04),
-- and the `provider_batch_key` column created unused for B10a.
--
-- The per-operation matrix is driven from one table-name array rather than
-- written out 25 times per role: each driver statement emits one TAP line per
-- table, so a table added to the array without a policy or a REVOKE fails the
-- suite instead of slipping through a copy-paste gap.
--
-- Runs inside a transaction and rolls back — safe to run repeatedly against a
-- local database. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(164);

-- -----------------------------------------------------------------------------
-- Fixture ids — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set admin_uid    '''00000000-0000-0000-0000-000000004aaa'''
\set docente_uid  '''00000000-0000-0000-0000-000000004ddd'''
\set contact_id   '''77777777-0000-0000-0000-000000000001'''
\set campaign_id  '''77777777-0000-0000-0000-000000000002'''
\set send_id      '''77777777-0000-0000-0000-000000000003'''
-- Tier 4 uses literal uuids rather than these variables: psql does not
-- interpolate `:name` inside the dollar-quoted statement bodies pgTAP takes.

-- The five tables, in one place. Every driver below iterates this array.
CREATE OR REPLACE FUNCTION pg_temp.comms_tables() RETURNS text[] AS $$
  SELECT ARRAY[
    'email_contacts',
    'email_campaigns',
    'email_campaign_sends',
    'email_suppression',
    'email_webhook_events'
  ];
$$ LANGUAGE sql IMMUTABLE;

-- =============================================================================
-- Structural checks (as postgres, before any role switching)
-- =============================================================================

-- [A2] RLS enabled on all five.
SELECT tests.rls_enabled('public', tbl)
  FROM unnest(pg_temp.comms_tables()) AS tbl;

-- [A2] Exactly ONE policy per table: admin, SELECT-only, TO authenticated.
-- Read from pg_policies rather than pgTAP's policy_* helpers so the check does
-- not depend on the installed pgTAP version.
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
      AND p.schemaname = 'public' AND p.tablename = tbl),
  tbl || '_admin_select|SELECT|authenticated',
  tbl || ': exactly one policy — admin SELECT-only, TO authenticated'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

-- [A2] No policy anywhere in the set carries a WITH CHECK — there is no
-- authenticated write path to gate in the first place.
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
      AND p.tablename = ANY (pg_temp.comms_tables())
      AND p.with_check IS NOT NULL),
  0,
  'comms tables: no policy carries a WITH CHECK — no authenticated write path exists'
);

-- [A2 / D-04] Privilege layer, pinned from the real ACL.
--
-- An `aclexplode` row is a TUPLE — (grantor, grantee, privilege_type,
-- is_grantable) — and a pin that reads only `privilege_type` for a named
-- grantee misses two real exposures, both of which survived the round-1 suite:
--
--   * `GRANT SELECT ... TO authenticated WITH GRANT OPTION` collapses into the
--     SAME ACL entry (`authenticated=r*/postgres`), so the privilege NAME is
--     unchanged while every authenticated session gains the right to re-grant
--     the table to anyone. Only `is_grantable` distinguishes the two states, so
--     it is part of the compared value below.
--   * `GRANT ... TO PUBLIC` writes a grantee-0 entry that NO per-role filter
--     can see: `anon`'s own ACL rows stay empty while `has_table_privilege`
--     starts answering true for it, because PUBLIC is inherited by every role.
--     A PUBLIC entry is therefore asserted absent in its own right.
--
-- `pg_temp.acl_entries` renders one grantee's entries as `PRIVILEGE` or
-- `PRIVILEGE WITH GRANT OPTION`, so both the privilege set and its grantability
-- are compared in a single `is()` whose diff names the offending privilege.
CREATE OR REPLACE FUNCTION pg_temp.acl_entries(tbl text, grantee_oid oid) RETURNS text AS $$
  SELECT coalesce(string_agg(e, ', ' ORDER BY e), '(none)')
    FROM (
      SELECT DISTINCT
             a.privilege_type
               || CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END AS e
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid = ('public.' || tbl)::regclass
         AND a.grantee = grantee_oid
    ) s;
$$ LANGUAGE sql STABLE;

-- Every grantable entry on a table, whoever holds it. D-04's posture is that
-- nobody — not anon, not authenticated, not service_role, not the owner — may
-- hand these tables on, so the expected value is '(none)' unconditionally and
-- the assert is version-independent (it enumerates whatever the ACL holds
-- rather than naming privileges that may not exist on a given server).
CREATE OR REPLACE FUNCTION pg_temp.grantable_entries(tbl text) RETURNS text AS $$
  SELECT coalesce(string_agg(e, ', ' ORDER BY e), '(none)')
    FROM (
      SELECT DISTINCT
             (CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END)
               || ':' || a.privilege_type AS e
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid = ('public.' || tbl)::regclass
         AND a.is_grantable
    ) s;
$$ LANGUAGE sql STABLE;

SELECT is(
  pg_temp.acl_entries(tbl, 'anon'::regrole::oid),
  '(none)',
  tbl || ' / anon: the ACL carries no entry for it — every privilege the server defines, standard or not, is revoked'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT is(
  pg_temp.acl_entries(tbl, 'authenticated'::regrole::oid),
  'SELECT',
  tbl || ' / authenticated: the ACL carries exactly {SELECT}, NOT grantable — nothing else, whatever privileges this server version defines'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT is(
  pg_temp.acl_entries(tbl, 0::oid),
  '(none)',
  tbl || ' / PUBLIC: no grantee-0 ACL entry — a PUBLIC grant is inherited by anon and every other role, so per-role pins alone cannot see it'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT is(
  pg_temp.grantable_entries(tbl),
  '(none)',
  tbl || ': no ACL entry anywhere on the table is grantable — no role may re-grant it to a third party'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT is(
  (SELECT count(*)::int
     FROM unnest(pg_temp.comms_tables()) AS t2
    WHERE has_table_privilege('anon', 'public.' || t2, 'TRUNCATE')),
  0,
  'anon: holds TRUNCATE on none of the five tables (RLS would not govern it)'
);

SELECT is(
  (SELECT count(*)::int
     FROM unnest(pg_temp.comms_tables()) AS t2
    WHERE has_table_privilege('authenticated', 'public.' || t2, 'TRUNCATE')),
  0,
  'authenticated: holds TRUNCATE on none of the five tables (RLS would not govern it)'
);

-- MAINTAIN (PostgreSQL 17+) — the privilege that motivated the grant-list form.
-- Wrapped in plpgsql so `has_table_privilege` is only called when the CASE
-- branch is taken: it raises "unrecognized privilege type" on servers below 17,
-- where the privilege simply does not exist. On the local/CI stack (17.6) these
-- run live; against the 15.8 production server they skip.
CREATE OR REPLACE FUNCTION pg_temp.count_maintain(role_name text) RETURNS int AS $$
DECLARE
  n int := 0;
  t text;
BEGIN
  FOREACH t IN ARRAY pg_temp.comms_tables()
  LOOP
    IF has_table_privilege(role_name, 'public.' || t, 'MAINTAIN') THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN is(
         pg_temp.count_maintain('anon'),
         0,
         'anon: holds MAINTAIN on none of the five tables (PostgreSQL 17+)'
       )
  ELSE skip(
         'MAINTAIN does not exist below PostgreSQL 17 (server is '
           || current_setting('server_version')
           || ') — the grant-list REVOKE ALL covers it on upgrade',
         1
       )
END;

SELECT CASE WHEN current_setting('server_version_num')::int >= 170000
  THEN is(
         pg_temp.count_maintain('authenticated'),
         0,
         'authenticated: holds MAINTAIN on none of the five tables (PostgreSQL 17+)'
       )
  ELSE skip(
         'MAINTAIN does not exist below PostgreSQL 17 (server is '
           || current_setting('server_version')
           || ') — the grant-list REVOKE ALL covers it on upgrade',
         1
       )
END;

SELECT ok(
  has_table_privilege('service_role', 'public.' || tbl, 'SELECT')
    AND has_table_privilege('service_role', 'public.' || tbl, 'INSERT')
    AND has_table_privilege('service_role', 'public.' || tbl, 'UPDATE')
    AND has_table_privilege('service_role', 'public.' || tbl, 'DELETE'),
  tbl || ' / service_role: CRUD privileges untouched by the REVOKEs — the only write path survives'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

-- [A1] The column B10a will need, created unused and nullable at B3.
SELECT has_column(
  'public', 'email_campaign_sends', 'provider_batch_key',
  'email_campaign_sends.provider_batch_key exists (created unused at B3 for B10a)'
);

SELECT col_is_null(
  'public', 'email_campaign_sends', 'provider_batch_key',
  'email_campaign_sends.provider_batch_key is nullable — nothing writes it until B10a'
);

-- [A1] The sanitized webhook ledger's payload column.
SELECT has_column(
  'public', 'email_webhook_events', 'detail',
  'email_webhook_events.detail exists (D-06 allowlisted, PII-free projection written only by process_webhook_event)'
);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as postgres, bypassing RLS).
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:admin_uid::uuid,   'admin@email-rls.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:docente_uid::uuid, 'docente@email-rls.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status)
VALUES
  (:admin_uid::uuid,   'admin@email-rls.local',   'RLS Correos Admin',   'approved'),
  (:docente_uid::uuid, 'docente@email-rls.local', 'RLS Correos Docente', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name)
VALUES (9401, 'RLS Correos Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES
  (:admin_uid::uuid,   'admin',   NULL, true),
  (:docente_uid::uuid, 'docente', 9401, true)
ON CONFLICT DO NOTHING;

-- One row per table, so the admin SELECT tier has something to see and the
-- ON DELETE RESTRICT tests have a real dependency to trip over.
INSERT INTO email_contacts (
  id, email, email_normalized, first_name, last_name, organization,
  tags, source, legal_basis, basis_note, basis_recorded_at, consent_notice_version,
  subscribed_at
)
VALUES (
  :contact_id::uuid, 'ana@email-rls.local', 'ana@email-rls.local', 'Ana', 'Prueba',
  'Colegio de Prueba', ARRAY['directivos'], 'manual', 'consent_form',
  'formulario pasantías', now(), 'v1', now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_campaigns (id, subject, preheader, audience_tags)
VALUES (:campaign_id::uuid, 'Novedades FNE', 'Octubre 2026', ARRAY['directivos'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_campaign_sends (id, campaign_id, contact_id, email, status)
VALUES (:send_id::uuid, :campaign_id::uuid, :contact_id::uuid, 'ana@email-rls.local', 'sent')
ON CONFLICT (id) DO NOTHING;

INSERT INTO email_suppression (email_hash, reason)
VALUES (repeat('a', 64), 'bounce')
ON CONFLICT (email_hash) DO NOTHING;

INSERT INTO email_webhook_events (svix_id, event_type, resend_email_id, occurred_at, detail)
VALUES ('msg_seed_0001', 'email.delivered', 're_seed_0001', now(), '{"classification":"delivered"}'::jsonb)
ON CONFLICT (svix_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helpers: impersonate an authenticated user / anon / service_role, and the
-- per-table statement drivers used by the three denial tiers.
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

-- Uniform per-table statements. INSERT uses DEFAULT VALUES because the ACL
-- check runs at executor start, before a tuple is ever formed: a role without
-- INSERT gets 42501, never a NOT NULL violation. UPDATE needs a real column, so
-- each table names its own timestamp; DELETE and TRUNCATE are shape-independent.
CREATE OR REPLACE FUNCTION pg_temp.stmt_select(tbl text) RETURNS text AS $$
  SELECT format('SELECT 1 FROM public.%I LIMIT 1', tbl);
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.stmt_insert(tbl text) RETURNS text AS $$
  SELECT format('INSERT INTO public.%I DEFAULT VALUES', tbl);
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.stmt_update(tbl text) RETURNS text AS $$
  SELECT format(
    'UPDATE public.%I SET %I = now() WHERE false',
    tbl,
    CASE WHEN tbl = 'email_webhook_events' THEN 'received_at' ELSE 'created_at' END
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.stmt_delete(tbl text) RETURNS text AS $$
  SELECT format('DELETE FROM public.%I WHERE false', tbl);
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.stmt_truncate(tbl text) RETURNS text AS $$
  SELECT format('TRUNCATE public.%I', tbl);
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.denied(tbl text) RETURNS text AS $$
  SELECT 'permission denied for table ' || tbl;
$$ LANGUAGE sql IMMUTABLE;

-- =============================================================================
-- Tier 1 — authenticated admin: SELECT only (D-04)
-- =============================================================================
SELECT pg_temp.set_authenticated(:admin_uid::uuid);

SELECT isnt_empty(
  pg_temp.stmt_select(tbl),
  'admin / ' || tbl || ': SELECT allowed — the policy lets an admin read the seeded row'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_insert(tbl), '42501', pg_temp.denied(tbl),
  'admin / ' || tbl || ': INSERT denied at the privilege layer (no INSERT grant, no WITH CHECK policy)'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_update(tbl), '42501', pg_temp.denied(tbl),
  'admin / ' || tbl || ': UPDATE denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

-- D-04 names DELETE on the tombstones and on the contacts specifically; the
-- driver covers those two and the other three in the same pass.
SELECT throws_ok(
  pg_temp.stmt_delete(tbl), '42501', pg_temp.denied(tbl),
  'admin / ' || tbl || ': DELETE denied at the privilege layer — erasure is anonymize-only'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

-- The exact bypass A2 was caught by: RLS does not apply to TRUNCATE, so only
-- the revoked grant stops an authenticated session from emptying the table.
SELECT throws_ok(
  pg_temp.stmt_truncate(tbl), '42501', pg_temp.denied(tbl),
  'admin / ' || tbl || ': TRUNCATE denied — the SELECT-only posture survives a command RLS never sees'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

RESET ROLE;

-- =============================================================================
-- Tier 2 — docente: SELECT reaches the policy and returns nothing; every write
-- command is denied at the privilege layer.
-- =============================================================================
SELECT pg_temp.set_authenticated(:docente_uid::uuid);

SELECT is_empty(
  pg_temp.stmt_select(tbl),
  'docente / ' || tbl || ': SELECT returns 0 rows — the admin-only policy filters everything'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_insert(tbl), '42501', pg_temp.denied(tbl),
  'docente / ' || tbl || ': INSERT denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_update(tbl), '42501', pg_temp.denied(tbl),
  'docente / ' || tbl || ': UPDATE denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_delete(tbl), '42501', pg_temp.denied(tbl),
  'docente / ' || tbl || ': DELETE denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_truncate(tbl), '42501', pg_temp.denied(tbl),
  'docente / ' || tbl || ': TRUNCATE denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

RESET ROLE;

-- =============================================================================
-- Tier 3 — anon: no policy applies to it AND it holds no privilege, so every
-- command is denied outright. Full per-operation matrix, TRUNCATE included.
-- =============================================================================
SELECT pg_temp.set_anon();

SELECT throws_ok(
  pg_temp.stmt_select(tbl), '42501', pg_temp.denied(tbl),
  'anon / ' || tbl || ': SELECT denied at the privilege layer (never reaches the policy)'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_insert(tbl), '42501', pg_temp.denied(tbl),
  'anon / ' || tbl || ': INSERT denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_update(tbl), '42501', pg_temp.denied(tbl),
  'anon / ' || tbl || ': UPDATE denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_delete(tbl), '42501', pg_temp.denied(tbl),
  'anon / ' || tbl || ': DELETE denied at the privilege layer'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

SELECT throws_ok(
  pg_temp.stmt_truncate(tbl), '42501', pg_temp.denied(tbl),
  'anon / ' || tbl || ': TRUNCATE denied — the command RLS never sees is stopped by the revoked grant'
) FROM unnest(pg_temp.comms_tables()) AS tbl;

RESET ROLE;

-- =============================================================================
-- Tier 4 — service_role: the only write path, and the constraints it must obey
-- =============================================================================
SELECT pg_temp.set_service_role();

-- [A4] service_role writes succeed on all five tables.
SELECT lives_ok(
  $$ INSERT INTO email_contacts (
       id, email, email_normalized, first_name, source, legal_basis,
       basis_recorded_at, tags
     ) VALUES (
       '77777777-0000-0000-0000-000000000011'::uuid,
       'bruno@email-rls.local', 'bruno@email-rls.local', 'Bruno',
       'csv_import', 'customer_relationship', now(), ARRAY['docentes']
     ) $$,
  'service_role: INSERT allowed on email_contacts'
);

SELECT lives_ok(
  $$ INSERT INTO email_campaigns (id, subject)
     VALUES ('77777777-0000-0000-0000-000000000012'::uuid, 'Borrador') $$,
  'service_role: INSERT allowed on email_campaigns'
);

SELECT lives_ok(
  $$ INSERT INTO email_campaign_sends (id, campaign_id, contact_id, email)
     VALUES (
       '77777777-0000-0000-0000-000000000013'::uuid,
       '77777777-0000-0000-0000-000000000002'::uuid,
       '77777777-0000-0000-0000-000000000011'::uuid,
       'bruno@email-rls.local'
     ) $$,
  'service_role: INSERT allowed on email_campaign_sends'
);

SELECT lives_ok(
  $$ INSERT INTO email_suppression (email_hash, reason)
     VALUES (repeat('b', 64), 'complaint') $$,
  'service_role: INSERT allowed on email_suppression'
);

SELECT lives_ok(
  $$ INSERT INTO email_webhook_events (svix_id, event_type, resend_email_id)
     VALUES ('msg_test_0002', 'email.bounced', 're_test_0002') $$,
  'service_role: INSERT allowed on email_webhook_events'
);

-- -----------------------------------------------------------------------------
-- [A1 / D-06] The two-shape identity CHECK. A row is a normal contact with a
-- consistent normalized email and a token, or an anonymized row whose whole
-- identity set is NULL. Nothing in between can commit — which is what makes a
-- partial anonymization impossible rather than merely unlikely.
--
-- The constraint is a disjunction of two arms, so a case that violates a term
-- in BOTH arms proves only that the constraint exists — drop any single term
-- and the other arm still rejects the row, leaving the test green. Round 1
-- learned that the hard way: removing `basis_note IS NULL` from the anonymized
-- arm left the whole gate passing. Each case below is therefore built to
-- violate exactly ONE term, so dropping that term turns exactly that line red:
-- the anonymized-arm fixtures satisfy every other NULL requirement and carry
-- `anonymized_at` (which alone rules out the live arm), and the live-arm
-- fixtures leave `anonymized_at` NULL and satisfy every other live requirement.
--
-- The live arm's two `IS NOT NULL` guards look redundant next to their sibling
-- `email_normalized = lower(btrim(email))` and are NOT: a CHECK constraint
-- admits a row when its expression is true OR **NULL**, and it is only false
-- that rejects. Drop `email IS NOT NULL` and a row with a NULL email makes the
-- comparison — and therefore the whole arm — NULL rather than false, so the row
-- COMMITS. The half-identified shapes below (an email with no normalized form,
-- a normalized form with no email) are what hold those two guards down.
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO email_contacts (source, legal_basis, basis_recorded_at)
     VALUES ('manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: a non-anonymized row with no email violates the two-shape identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('  Mixed@Email-RLS.local ', 'Mixed@Email-RLS.local', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: email_normalized that is not lower(btrim(email)) violates the two-shape identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, unsubscribe_token, source, legal_basis, basis_recorded_at)
     VALUES ('sintoken@email-rls.local', 'sintoken@email-rls.local', NULL, 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: a live row without an unsubscribe_token violates the identity CHECK (D-08 needs one per recipient)'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('   ', '', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: a live row whose normalized email is the empty string violates the identity CHECK (email_normalized <> '''')'
);

-- The two half-identified live shapes. Each leaves the equality term NULL, so
-- without its own `IS NOT NULL` guard the arm would evaluate to NULL and the
-- CHECK would ADMIT the row — these are the cases that make those guards real.
SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, source, legal_basis, basis_recorded_at)
     VALUES ('sinnormalizar@email-rls.local', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: a live row with an email but no email_normalized violates the identity CHECK (the equality term alone would evaluate to NULL, which a CHECK admits)'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('huerfano@email-rls.local', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: a live row with an email_normalized but no email violates the identity CHECK (same NULL-admits-the-row trap, mirrored)'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, anonymized_at, source, legal_basis, basis_recorded_at)
     VALUES ('resto@email-rls.local', 'resto@email-rls.local', now(), 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: anonymized_at set while the email survives violates the identity CHECK — no partial erasure'
);

-- The anonymized arm, one identity field per line. Every fixture below is a
-- fully anonymized row EXCEPT for the single named field, so the only term that
-- can reject it is that field's own `IS NULL` clause.
--
-- This first one is the arm's marker term, and it needs an EXPLICIT NULL token:
-- `unsubscribe_token` defaults to gen_random_uuid(), so an otherwise-empty row
-- that omits the column is rejected by `unsubscribe_token IS NULL` instead and
-- the marker term goes unproven (that default is precisely why the fail-on-
-- mutant probe caught this case and prose reasoning did not).
SELECT throws_ok(
  $$ INSERT INTO email_contacts (unsubscribe_token, source, legal_basis, basis_recorded_at)
     VALUES (NULL, 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a row with the whole identity set NULL but no anonymized_at marker violates the identity CHECK — erasure must be stamped, not inferred'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, email, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'resta-email@email-rls.local', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained email alone violates the identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'resta-norm@email-rls.local', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained email_normalized alone violates the identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, first_name, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'Ana', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained first_name alone violates the identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, last_name, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'Sintetica', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained last_name alone violates the identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, organization, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'Colegio Sintetico', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained organization alone violates the identity CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, basis_note, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'alta verificada por el equipo', 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained basis_note alone violates the identity CHECK (it can name a person — this is the term round 1 could drop unnoticed)'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, source, legal_basis, basis_recorded_at)
     VALUES (now(), '77777777-0000-0000-0000-0000000000aa'::uuid, 'manual', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts / anonymized arm: a retained unsubscribe_token alone violates the identity CHECK'
);

SELECT lives_ok(
  $$ INSERT INTO email_contacts (anonymized_at, unsubscribe_token, source, legal_basis, basis_recorded_at)
     VALUES (now(), NULL, 'manual', 'manual_verified', now()) $$,
  'contacts: the fully anonymized shape (all identity NULL + anonymized_at) commits'
);

-- The live arm's inverse: those same identity fields are OPTIONAL on a live
-- row, so a contact carrying all of them commits. If the anonymized arm's NULL
-- requirements ever leaked into the live arm, this line is what catches it.
SELECT lives_ok(
  $$ INSERT INTO email_contacts (
       email, email_normalized, first_name, last_name, organization, basis_note,
       source, legal_basis, basis_recorded_at
     ) VALUES (
       'viva@email-rls.local', 'viva@email-rls.local', 'Ana', 'Sintetica',
       'Colegio Sintetico', 'alta verificada por el equipo',
       'manual', 'manual_verified', now()
     ) $$,
  'contacts: a live row may carry every identity field — the anonymized arm''s NULL requirements do not apply to it'
);

-- -----------------------------------------------------------------------------
-- [A3 / D-12] Consent and basis columns carry no defaults.
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, basis_recorded_at)
     VALUES ('sinbase@email-rls.local', 'sinbase@email-rls.local', 'manual', now()) $$,
  '23502', NULL,
  'contacts: INSERT without legal_basis violates NOT NULL (no default may manufacture a legal basis)'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis)
     VALUES ('sinfecha@email-rls.local', 'sinfecha@email-rls.local', 'manual', 'manual_verified') $$,
  '23502', NULL,
  'contacts: INSERT without basis_recorded_at violates NOT NULL (no default)'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('malabase@email-rls.local', 'malabase@email-rls.local', 'manual', 'legitimate_interest', now()) $$,
  '23514', NULL,
  'contacts: legal_basis outside consent_form|customer_relationship|manual_verified violates the CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('sinversion@email-rls.local', 'sinversion@email-rls.local', 'manual', 'consent_form', now()) $$,
  '23514', NULL,
  'contacts: consent_form basis without consent_notice_version violates the CHECK (D-12 evidence)'
);

SELECT lives_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at, consent_notice_version)
     VALUES ('conversion@email-rls.local', 'conversion@email-rls.local', 'pasantia_leads', 'consent_form', now(), 'v1') $$,
  'contacts: consent_form basis with its notice version commits'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at, suppressed_at)
     VALUES ('supsinmotivo@email-rls.local', 'supsinmotivo@email-rls.local', 'manual', 'manual_verified', now(), now()) $$,
  '23514', NULL,
  'contacts: suppressed_at without suppression_reason violates the suppression CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at, suppression_reason)
     VALUES ('motivosinsup@email-rls.local', 'motivosinsup@email-rls.local', 'manual', 'manual_verified', now(), 'bounce') $$,
  '23514', NULL,
  'contacts: suppression_reason without suppressed_at violates the suppression CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at, suppressed_at, suppression_reason)
     VALUES ('malmotivo@email-rls.local', 'malmotivo@email-rls.local', 'manual', 'manual_verified', now(), now(), 'porque_si') $$,
  '23514', NULL,
  'contacts: suppression_reason outside bounce|complaint|manual|failed|suppressed violates the CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('ana@email-rls.local', 'ana@email-rls.local', 'manual', 'manual_verified', now()) $$,
  '23505', NULL,
  'contacts: duplicate email_normalized violates the unique constraint'
);

SELECT throws_ok(
  $$ INSERT INTO email_contacts (email, email_normalized, source, legal_basis, basis_recorded_at)
     VALUES ('malorigen@email-rls.local', 'malorigen@email-rls.local', 'linkedin', 'manual_verified', now()) $$,
  '23514', NULL,
  'contacts: source outside the allowed set violates the CHECK'
);

-- -----------------------------------------------------------------------------
-- [A1 / D-07] Campaign lifecycle constraints. Note what is NOT in the CHECK:
-- there is no `failed` status — a campaign that queues nothing stays draft.
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO email_campaigns (subject, status) VALUES ('Mala', 'failed') $$,
  '23514', NULL,
  'campaigns: status `failed` is rejected — D-07 removed it; a zero-audience campaign stays draft'
);

SELECT is(
  (SELECT status FROM email_campaigns WHERE id = '77777777-0000-0000-0000-000000000012'::uuid),
  'draft',
  'campaigns: a freshly inserted campaign defaults to draft'
);

-- -----------------------------------------------------------------------------
-- [A1] Send-ledger constraints, including the ON DELETE RESTRICT pair that make
-- send history undeletable (D-04: erasure is anonymize-only).
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO email_campaign_sends (campaign_id, contact_id, status)
     VALUES (
       '77777777-0000-0000-0000-000000000012'::uuid,
       '77777777-0000-0000-0000-000000000011'::uuid,
       'queued'
     ) $$,
  '23514', NULL,
  'sends: status outside pending|sending|sent|failed|skipped violates the CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_campaign_sends (campaign_id, contact_id)
     VALUES (
       '77777777-0000-0000-0000-000000000002'::uuid,
       '77777777-0000-0000-0000-000000000001'::uuid
     ) $$,
  '23505', NULL,
  'sends: a second row for the same (campaign, contact) violates the unique constraint — the ledger is the idempotency key'
);

SELECT is(
  (SELECT status FROM email_campaign_sends WHERE id = '77777777-0000-0000-0000-000000000013'::uuid),
  'pending',
  'sends: a freshly inserted send row defaults to pending'
);

SELECT throws_ok(
  $$ DELETE FROM email_contacts WHERE id = '77777777-0000-0000-0000-000000000001'::uuid $$,
  '23503', NULL,
  'sends: deleting a contact that has send history is RESTRICTed — erasure is anonymize-only, never a cascade'
);

SELECT throws_ok(
  $$ DELETE FROM email_campaigns WHERE id = '77777777-0000-0000-0000-000000000002'::uuid $$,
  '23503', NULL,
  'sends: deleting a campaign that has send history is RESTRICTed — the draft-only delete route is unaffected (drafts have no sends)'
);

-- -----------------------------------------------------------------------------
-- [A1] Tombstones and the sanitized webhook ledger.
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO email_suppression (email_hash, reason)
     VALUES (repeat('c', 64), 'porque_si') $$,
  '23514', NULL,
  'suppression: reason outside bounce|complaint|manual|failed|suppressed violates the CHECK'
);

SELECT throws_ok(
  $$ INSERT INTO email_suppression (email_hash, reason)
     VALUES (repeat('a', 64), 'manual') $$,
  '23505', NULL,
  'suppression: email_hash is the primary key — one tombstone per address'
);

SELECT throws_ok(
  $$ INSERT INTO email_webhook_events (svix_id, event_type)
     VALUES ('msg_seed_0001', 'email.opened') $$,
  '23505', NULL,
  'webhook events: svix_id is the primary key — a redelivery cannot insert twice (D-08 dedup)'
);

SELECT throws_ok(
  $$ INSERT INTO email_webhook_events (svix_id) VALUES ('msg_test_0003') $$,
  '23502', NULL,
  'webhook events: event_type is NOT NULL — a ledger row always says what it recorded'
);

SELECT is(
  (SELECT detail FROM email_webhook_events WHERE svix_id = 'msg_test_0002'),
  '{}'::jsonb,
  'webhook events: detail defaults to an empty object — B4b projects the allowlisted subset into it, never a raw payload'
);

-- -----------------------------------------------------------------------------
-- [A1] updated_at triggers.
-- -----------------------------------------------------------------------------
UPDATE email_contacts
   SET updated_at = timestamptz '2020-01-01 00:00:00+00'
 WHERE id = '77777777-0000-0000-0000-000000000011'::uuid;

SELECT ok(
  (SELECT updated_at > timestamptz '2020-01-02 00:00:00+00'
     FROM email_contacts
    WHERE id = '77777777-0000-0000-0000-000000000011'::uuid),
  'email_contacts: set_updated_at trigger refreshes updated_at on UPDATE'
);

UPDATE email_campaigns
   SET updated_at = timestamptz '2020-01-01 00:00:00+00'
 WHERE id = '77777777-0000-0000-0000-000000000012'::uuid;

SELECT ok(
  (SELECT updated_at > timestamptz '2020-01-02 00:00:00+00'
     FROM email_campaigns
    WHERE id = '77777777-0000-0000-0000-000000000012'::uuid),
  'email_campaigns: set_updated_at trigger refreshes updated_at on UPDATE'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
