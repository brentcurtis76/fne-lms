-- =============================================================================
-- 178-contracts-store-upload.sql — GENERA fixes F26, build A, item N85:
-- migration 20261124141000_contracts_store_admin_upload.sql.
--
-- The `contracts` store had no permissive rule on storage.objects, so the four
-- RESTRICTIVE file_stores_boundary_* rules (admin for insert) gave nobody an
-- upload: «Subir Contrato Firmado» and the PDF importer failed for every admin.
-- The migration adds ONE permissive rule, contracts_admin_insert: an active
-- admin may INSERT into `contracts`. No read, update or delete rule is added
-- (files are opened through five-minute links signed by the server).
--
-- Fixtures: the `contracts` store (public, as in Production) and the `facturas`
-- store with Production's permissive model rule for it, verbatim as 126 creates
-- it; invented people (admin, inactive admin, docente, consultor).
-- Blocked INSERT throws 42501; a blocked SELECT returns 0 rows.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(13);

-- ---------------------------------------------------------------------------
-- 1. Catalog: exactly the one new rule, for INSERT on contracts
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'contracts_admin_insert' AND permissive = 'PERMISSIVE'
                   AND roles = ARRAY['authenticated']::name[] AND cmd = 'INSERT'
                   AND with_check LIKE '%bucket_id = ''contracts''%' AND with_check LIKE '%auth_is_admin()%'),
  'contracts_admin_insert: PERMISSIVE, TO authenticated, FOR INSERT, contracts and auth_is_admin()');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND permissive = 'PERMISSIVE'
             AND (coalesce(qual, '') LIKE '%''contracts''%' OR coalesce(with_check, '') LIKE '%''contracts''%')),
  1, 'contracts_admin_insert is the only permissive rule that names the contracts store');

-- ---------------------------------------------------------------------------
-- Fixtures (postgres, synthetic)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('facturas', 'facturas', true) ON CONFLICT DO NOTHING;
-- Production's permissive rule for facturas, verbatim from the model (as 126).
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='facturas_all_operations') THEN EXECUTE $p$CREATE POLICY "facturas_all_operations" ON storage.objects AS PERMISSIVE FOR ALL TO public USING ((bucket_id = 'facturas'::text)) WITH CHECK ((bucket_id = 'facturas'::text))$p$; END IF; END $m$;

SELECT tests.create_supabase_user('ct178_admin');
SELECT tests.create_supabase_user('ct178_inactive');
SELECT tests.create_supabase_user('ct178_docente');
SELECT tests.create_supabase_user('ct178_consultor');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@ct178.test.local', k, 'approved', false
  FROM unnest(ARRAY['ct178_admin','ct178_inactive','ct178_docente','ct178_consultor']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (917801, 'CT178 school (pgTAP 178)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('ct178_admin'),     'admin',     NULL,   true),
  (pg_temp.uid('ct178_inactive'),  'admin',     NULL,   false),
  (pg_temp.uid('ct178_docente'),   'docente',   917801, true),
  (pg_temp.uid('ct178_consultor'), 'consultor', 917801, true);
REFRESH MATERIALIZED VIEW public.user_roles_cache;

CREATE OR REPLACE FUNCTION pg_temp.n(b text, nm text) RETURNS int LANGUAGE sql AS
  $$ SELECT count(*)::int FROM storage.objects WHERE bucket_id = b AND name = nm $$;
GRANT EXECUTE ON FUNCTION pg_temp.n(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. An active admin uploads a contract file; cannot read it back with the session
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('ct178_admin');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('contracts', 'contrato_ct178_1700000000000.pdf', auth.uid())$$,
  'an active admin uploads a signed contract to contracts');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('contracts', 'importado_ct178_1700000000001.pdf', auth.uid())$$,
  'an active admin keeps an imported PDF in contracts');
SELECT is(pg_temp.n('contracts', 'contrato_ct178_1700000000000.pdf'), 0,
  'the admin''s own session lists 0 rows of that file (no read rule is added)');
-- facturas: as 126 asserts (admin uploads).
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('facturas', 'invoice_ct178_admin.pdf', auth.uid())$$,
  'facturas unchanged: the admin uploads an invoice');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 3. Anyone else is refused
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('ct178_inactive');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('contracts', 'contrato_ct178_inactive.pdf', auth.uid())$$,
  '42501', NULL, 'an inactive admin cannot upload to contracts');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('ct178_docente');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('contracts', 'contrato_ct178_docente.pdf', auth.uid())$$,
  '42501', NULL, 'a docente cannot upload to contracts');
-- facturas: as 126 asserts (a non-admin cannot upload).
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('facturas', 'invoice_ct178_docente.pdf', auth.uid())$$,
  '42501', NULL, 'facturas unchanged: a docente cannot upload an invoice');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('ct178_consultor');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('contracts', 'contrato_ct178_consultor.pdf', auth.uid())$$,
  '42501', NULL, 'a consultor cannot upload to contracts');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE anon;
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('contracts', 'contrato_ct178_visitor.pdf')$$,
  '42501', NULL, 'a visitor cannot upload to contracts');
SELECT is(pg_temp.n('contracts', 'contrato_ct178_1700000000000.pdf'), 0, 'a visitor lists 0 rows of contracts');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. What is stored: only the admin's two files
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'contracts' AND name LIKE '%ct178%'), 2,
  'only the admin''s two files reached contracts');

SELECT * FROM finish();
ROLLBACK;
