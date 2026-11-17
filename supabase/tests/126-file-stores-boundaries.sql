-- =============================================================================
-- 126-file-stores-boundaries.sql — GENERA fixes F2b (GES-1.4, EC-S3, N17):
-- migration 20261116178000_file_stores_boundaries.sql.
--
-- One function, public.file_store_allows(bucket, name, owner, action, id), and four
-- RESTRICTIVE rules TO public on storage.objects narrow what Production's
-- permissive storage rules allow:
--   all buckets       a visitor never inserts, updates or deletes
--   facturas          admin only, for select / insert / update / delete
--   resources         admin everything; documents/<ws>/ select+insert for people
--                     of that workspace; news-images/ select+insert for a
--                     community manager; nothing else (visitors list nothing)
--   assignments       select: admin or owner; insert unchanged; update, delete: admin
--   community-images  select, insert unchanged; update, delete: admin or a person
--                     of the workspace named in community-images/<ws>-…
--   boletas           insert unchanged; select, delete: admin, owner, or (no owner
--                     and a server record of THIS object id for the caller,
--                     written only by record_expense_receipt_file); update (and a
--                     move into boletas): admin, or owner; since F7d
--                     (20261117166000) every action except an admin's needs a
--                     filing role (auth_can_file_expenses), not can_submit
--   course-materials, course-assets, instructor-photos, contracts:
--                     insert / update / delete admin only; select unchanged
--   other buckets     unchanged for signed-in people
--
-- Fixtures: the governed buckets and, verbatim from the catalogue model of
-- Production (tools/storage-model.sql of the F2b work), Production's permissive
-- rules for those buckets (created only when a rule of that name does not
-- already exist); one ungoverned bucket with an open model rule (as in 105);
-- invented people; objects inserted as postgres with their owner.
-- Blocked INSERT throws 42501; blocked SELECT / UPDATE / DELETE touch 0 rows.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(180);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'file_store_allows'
                     AND pg_get_function_identity_arguments(p.oid) = 'p_bucket text, p_name text, p_owner uuid, p_action text, p_id uuid'
                     AND p.prorettype = 'boolean'::regtype),
  'public.file_store_allows(text, text, uuid, text, uuid) returns boolean');
SELECT is(to_regprocedure('public.file_store_allows(text, text, uuid, text)'), NULL,
  'no four-argument file_store_allows is left behind');
SELECT ok((SELECT prosecdef AND provolatile = 's' AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
             FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure),
  'file_store_allows is plpgsql, STABLE, SECURITY DEFINER');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure),
  ARRAY['search_path=public, pg_temp'], 'file_store_allows pins search_path = public, pg_temp');
SELECT ok(has_function_privilege('anon', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE'), 'anon may execute file_store_allows');
SELECT ok(has_function_privilege('authenticated', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE'), 'authenticated may execute file_store_allows');
SELECT ok(has_function_privilege('service_role', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE'), 'service_role may execute file_store_allows');
SELECT is((SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
            WHERE p.oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure AND a.grantee = 0), 0,
  'PUBLIC holds no EXECUTE on file_store_allows');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_select' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'SELECT' AND qual LIKE '%file_store_allows(%, id)%'),
  'file_stores_boundary_select: RESTRICTIVE, TO public, FOR SELECT');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_insert' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'INSERT' AND with_check LIKE '%file_store_allows(%, id)%'),
  'file_stores_boundary_insert: RESTRICTIVE, TO public, FOR INSERT');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_update' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'UPDATE'
                   AND qual LIKE '%file_store_allows(%, id)%' AND with_check LIKE '%file_store_allows(%, id)%'),
  'file_stores_boundary_update: RESTRICTIVE, TO public, FOR UPDATE (USING and WITH CHECK)');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_delete' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'DELETE' AND qual LIKE '%file_store_allows(%, id)%'),
  'file_stores_boundary_delete: RESTRICTIVE, TO public, FOR DELETE');
-- The server-only record of receipts (send-back 1, by object id since send-back 2)
SELECT is((SELECT array_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)::text
             FROM pg_attribute a WHERE a.attrelid = to_regclass('public.expense_receipt_files') AND a.attnum > 0 AND NOT a.attisdropped),
  '{object_id:uuid,object_name:text,user_id:uuid,"recorded_at:timestamp with time zone",source:text}',
  'expense_receipt_files columns: object_id, object_name, user_id, recorded_at, source');
SELECT is((SELECT array_agg(a.attname::text)::text FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
            WHERE i.indrelid = to_regclass('public.expense_receipt_files') AND i.indisprimary),
  '{object_id}', 'expense_receipt_files primary key is object_id (the file''s identity, not its name)');
SELECT ok(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.expense_receipt_files')), false),
  'public.expense_receipt_files exists with row security enabled');
SELECT is((SELECT array_agg(policyname || ':' || permissive ORDER BY policyname)::text FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'expense_receipt_files'),
  '{forced_password_change_guard:RESTRICTIVE}',
  'expense_receipt_files has no rule that gives anyone access (only the repo''s restrictive forced-password guard)');
SELECT ok(to_regclass('public.expense_receipt_files') IS NOT NULL
          AND NOT has_table_privilege('anon', 'public.expense_receipt_files', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          AND NOT has_table_privilege('authenticated', 'public.expense_receipt_files', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'anon and authenticated hold no privilege on expense_receipt_files');
SELECT ok(to_regclass('public.expense_receipt_files') IS NOT NULL
          AND (SELECT count(*) FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = to_regclass('public.expense_receipt_files') AND a.grantee = 0) = 0,
  'PUBLIC holds no privilege on expense_receipt_files');
SELECT ok(to_regclass('public.expense_receipt_files') IS NOT NULL
          AND has_table_privilege('service_role', 'public.expense_receipt_files', 'SELECT')
          AND has_table_privilege('service_role', 'public.expense_receipt_files', 'DELETE')
          AND NOT has_table_privilege('service_role', 'public.expense_receipt_files', 'INSERT')
          AND NOT has_table_privilege('service_role', 'public.expense_receipt_files', 'UPDATE'),
  'service_role holds SELECT, DELETE (not INSERT, not UPDATE) on expense_receipt_files');
SELECT ok(coalesce((SELECT p.prosecdef AND p.proconfig = ARRAY['search_path=public, pg_temp'] AND p.prorettype = 'boolean'::regtype
                      FROM pg_proc p WHERE p.oid = to_regprocedure('public.record_expense_receipt_file(text, uuid)')), false),
  'record_expense_receipt_file(text, uuid) returns boolean, SECURITY DEFINER, search_path pinned');
SELECT ok(to_regprocedure('public.record_expense_receipt_file(text, uuid)') IS NOT NULL
          AND NOT has_function_privilege('anon', to_regprocedure('public.record_expense_receipt_file(text, uuid)'), 'EXECUTE')
          AND NOT has_function_privilege('authenticated', to_regprocedure('public.record_expense_receipt_file(text, uuid)'), 'EXECUTE')
          AND has_function_privilege('service_role', to_regprocedure('public.record_expense_receipt_file(text, uuid)'), 'EXECUTE')
          AND (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
                WHERE p.oid = to_regprocedure('public.record_expense_receipt_file(text, uuid)') AND a.grantee = 0) = 0,
  'record_expense_receipt_file: EXECUTE for service_role only (not PUBLIC, anon, authenticated)');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'public' AND p.proname = 'backfill_expense_receipt_files'),
  'there is no backfill: public.backfill_expense_receipt_files does not exist');

-- ---------------------------------------------------------------------------
-- Fixtures (postgres, synthetic)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('facturas', 'facturas', true), ('resources', 'resources', true), ('assignments', 'assignments', true),
  ('community-images', 'community-images', true), ('boletas', 'boletas', false),
  ('course-materials', 'course-materials', true), ('course-assets', 'course-assets', true),
  ('instructor-photos', 'instructor-photos', true), ('contracts', 'contracts', true),
  ('f2b126-other', 'f2b126-other', true)
ON CONFLICT (id) DO NOTHING;

-- Production's permissive rules for the governed buckets, verbatim from the model.
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin can delete from boletas bucket') THEN EXECUTE $p$CREATE POLICY "Admin can delete from boletas bucket" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'boletas'::text) AND (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true))))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin can read from boletas bucket') THEN EXECUTE $p$CREATE POLICY "Admin can read from boletas bucket" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'boletas'::text) AND (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true))))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin can update boletas bucket') THEN EXECUTE $p$CREATE POLICY "Admin can update boletas bucket" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'boletas'::text) AND (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true))))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin can upload to boletas bucket') THEN EXECUTE $p$CREATE POLICY "Admin can upload to boletas bucket" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'boletas'::text) AND (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true))))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin upload access for instructor photos') THEN EXECUTE $p$CREATE POLICY "Admin upload access for instructor photos" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((bucket_id = 'instructor-photos'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow expense report users to delete receipts') THEN EXECUTE $p$CREATE POLICY "Allow expense report users to delete receipts" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'boletas'::text) AND ((EXISTS ( SELECT 1
   FROM expense_report_access
  WHERE ((expense_report_access.user_id = auth.uid()) AND (expense_report_access.can_submit = true)))) OR (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true)))) OR (owner = auth.uid()))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow expense report users to read receipts') THEN EXECUTE $p$CREATE POLICY "Allow expense report users to read receipts" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'boletas'::text) AND ((EXISTS ( SELECT 1
   FROM expense_report_access
  WHERE (expense_report_access.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true)))) OR (owner = auth.uid()))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow expense report users to update receipts') THEN EXECUTE $p$CREATE POLICY "Allow expense report users to update receipts" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'boletas'::text) AND ((EXISTS ( SELECT 1
   FROM expense_report_access
  WHERE ((expense_report_access.user_id = auth.uid()) AND (expense_report_access.can_submit = true)))) OR (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true)))) OR (owner = auth.uid()))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow expense report users to upload receipts') THEN EXECUTE $p$CREATE POLICY "Allow expense report users to upload receipts" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'boletas'::text) AND ((EXISTS ( SELECT 1
   FROM expense_report_access
  WHERE ((expense_report_access.user_id = auth.uid()) AND (expense_report_access.can_submit = true)))) OR (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true)))))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public deletes from resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public deletes from resources bucket" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public reads from resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public reads from resources bucket" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public updates to resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public updates to resources bucket" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING ((bucket_id = 'resources'::text)) WITH CHECK ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public uploads to resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public uploads to resources bucket" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow uploads to course-assets') THEN EXECUTE $p$CREATE POLICY "Allow uploads to course-assets" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'course-assets'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anyone can view course materials') THEN EXECUTE $p$CREATE POLICY "Anyone can view course materials" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'course-materials'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload assignment files') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload assignment files" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'assignments'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload community images') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload community images" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload course materials') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload course materials" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'course-materials'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can view assignment files') THEN EXECUTE $p$CREATE POLICY "Authenticated users can view assignment files" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'assignments'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public can view community images') THEN EXECUTE $p$CREATE POLICY "Public can view community images" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public read access for instructor photos') THEN EXECUTE $p$CREATE POLICY "Public read access for instructor photos" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'instructor-photos'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their community images') THEN EXECUTE $p$CREATE POLICY "Users can delete their community images" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own assignment files') THEN EXECUTE $p$CREATE POLICY "Users can delete their own assignment files" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'assignments'::text) AND ((storage.foldername(name))[1] = 'group-submissions'::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own course materials') THEN EXECUTE $p$CREATE POLICY "Users can delete their own course materials" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'course-materials'::text) AND (owner = auth.uid())))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their community images') THEN EXECUTE $p$CREATE POLICY "Users can update their community images" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their own assignment files') THEN EXECUTE $p$CREATE POLICY "Users can update their own assignment files" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'assignments'::text) AND ((storage.foldername(name))[1] = 'group-submissions'::text))) WITH CHECK ((bucket_id = 'assignments'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their own course materials') THEN EXECUTE $p$CREATE POLICY "Users can update their own course materials" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'course-materials'::text) AND (owner = auth.uid())))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='authenticated_users_delete_group_submissions') THEN EXECUTE $p$CREATE POLICY "authenticated_users_delete_group_submissions" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'assignments'::text) AND ((storage.foldername(name))[1] = 'group-submissions'::text) AND (auth.role() = 'authenticated'::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='authenticated_users_read_group_submissions') THEN EXECUTE $p$CREATE POLICY "authenticated_users_read_group_submissions" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'assignments'::text) AND ((storage.foldername(name))[1] = 'group-submissions'::text) AND (auth.role() = 'authenticated'::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='authenticated_users_upload_group_submissions') THEN EXECUTE $p$CREATE POLICY "authenticated_users_upload_group_submissions" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'assignments'::text) AND ((storage.foldername(name))[1] = 'group-submissions'::text) AND (auth.role() = 'authenticated'::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='facturas_all_operations') THEN EXECUTE $p$CREATE POLICY "facturas_all_operations" ON storage.objects AS PERMISSIVE FOR ALL TO public USING ((bucket_id = 'facturas'::text)) WITH CHECK ((bucket_id = 'facturas'::text))$p$; END IF; END $m$;
-- The ungoverned bucket: an open model rule, as 105 does for its "other" bucket.
CREATE POLICY "f2b126 model other" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'f2b126-other') WITH CHECK (bucket_id = 'f2b126-other');

SELECT tests.create_supabase_user('f2b126_admin');
SELECT tests.create_supabase_user('f2b126_cm');
SELECT tests.create_supabase_user('f2b126_member');
SELECT tests.create_supabase_user('f2b126_member2');
SELECT tests.create_supabase_user('f2b126_out');
SELECT tests.create_supabase_user('f2b126_learner_a');
SELECT tests.create_supabase_user('f2b126_learner_b');
SELECT tests.create_supabase_user('f2b126_filer');
SELECT tests.create_supabase_user('f2b126_access2');
SELECT tests.create_supabase_user('f2b126_cm2');
SELECT tests.create_supabase_user('f2b126_nosubmit');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@f2b126.test.local', k, 'approved', false
  FROM unnest(ARRAY['f2b126_admin','f2b126_cm','f2b126_member','f2b126_member2','f2b126_out',
                    'f2b126_learner_a','f2b126_learner_b','f2b126_filer','f2b126_access2','f2b126_cm2','f2b126_nosubmit']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (912601, 'F2b school (pgTAP 126)'), (912602, 'F2b other school (pgTAP 126)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('12600000-0000-4000-8000-0000000000c1', 912601, 'F2b community 1'),
  ('12600000-0000-4000-8000-0000000000c2', 912602, 'F2b community 2');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('12600000-0000-4000-8000-0000000000b1', '12600000-0000-4000-8000-0000000000c1', 'F2b workspace 1'),
  ('12600000-0000-4000-8000-0000000000b2', '12600000-0000-4000-8000-0000000000c2', 'F2b workspace 2');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f2b126_admin'),     'admin',             NULL,   NULL, true),
  (pg_temp.uid('f2b126_cm'),        'community_manager', 912601, '12600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f2b126_cm2'),       'community_manager', 912602, '12600000-0000-4000-8000-0000000000c2', true),
  (pg_temp.uid('f2b126_member'),    'docente',           912601, '12600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f2b126_member2'),   'lider_comunidad',   912601, '12600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f2b126_out'),       'equipo_directivo',  912602, NULL, true),
  (pg_temp.uid('f2b126_learner_a'), 'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_learner_b'), 'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_filer'),     'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_access2'),   'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_nosubmit'),  'docente',           912601, NULL, true),
  -- F7d (20261117166000): the store follows the role, so the two filers A and B
  -- also hold an active filing role (consultor)
  (pg_temp.uid('f2b126_filer'),     'consultor',         912601, NULL, true),
  (pg_temp.uid('f2b126_access2'),   'consultor',         912601, NULL, true);
INSERT INTO public.expense_report_access (user_id, can_submit, granted_by, notes) VALUES
  (pg_temp.uid('f2b126_filer'),   true, pg_temp.uid('f2b126_admin'), 'F2b 126 sintetico'),
  (pg_temp.uid('f2b126_access2'), true, pg_temp.uid('f2b126_admin'), 'F2b 126 sintetico'),
  (pg_temp.uid('f2b126_nosubmit'), false, pg_temp.uid('f2b126_admin'), 'F2b 126 sintetico (sin can_submit)')
ON CONFLICT (user_id) DO UPDATE SET can_submit = EXCLUDED.can_submit;
INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status) VALUES
  ('12600000-0000-4000-8000-0000000000e1', 'F2b 126 rendicion sintetica', '2027-02-01', '2027-02-02', pg_temp.uid('f2b126_filer'), 'draft'),
  ('12600000-0000-4000-8000-0000000000e2', 'F2b 126 rendicion sintetica B', '2027-02-01', '2027-02-02', pg_temp.uid('f2b126_access2'), 'draft');
INSERT INTO public.expense_items (report_id, description, amount, expense_date, receipt_url) VALUES
  ('12600000-0000-4000-8000-0000000000e1', 'F2b 126 gasto (lugar)', 1000, '2027-02-01', 'boletas/f2b126_svc.pdf'),
  ('12600000-0000-4000-8000-0000000000e1', 'F2b 126 gasto (enlace)', 2000, '2027-02-02',
   'http://127.0.0.1:54321/storage/v1/object/sign/boletas/f2b126_link.pdf?token=sintetico');

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('facturas', 'invoice_f2b126_1.pdf', NULL),
  ('resources', 'images/f2b126.png', NULL),
  ('resources', 'news-images/f2b126.png', NULL),
  ('resources', 'Equipo/f2b126.png', NULL),
  ('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf', pg_temp.uid('f2b126_member')),
  ('resources', 'documents/12600000-0000-4000-8000-0000000000b2/root/f2b126.pdf', NULL),
  ('assignments', 'group-submissions/12600000-0000-4000-8000-0000000000a1/12600000-0000-4000-8000-0000000000d1/f2b126.pdf', pg_temp.uid('f2b126_learner_a')),
  ('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-1.png', pg_temp.uid('f2b126_member')),
  ('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-2.png', pg_temp.uid('f2b126_member')),
  ('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-3.png', pg_temp.uid('f2b126_member')),
  ('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-4.png', pg_temp.uid('f2b126_member')),
  ('boletas', 'f2b126_own.pdf', pg_temp.uid('f2b126_filer')),
  ('boletas', 'f2b126_svc.pdf', NULL),
  ('boletas', 'f2b126_link.pdf', NULL),
  ('boletas', 'f2b126_unlinked.pdf', NULL),
  ('boletas', 'f2b126_a_secret.pdf', pg_temp.uid('f2b126_filer')),
  ('boletas', 'f2b126_a_secret2.pdf', pg_temp.uid('f2b126_filer')),
  ('boletas', 'f2b126_scan.pdf', pg_temp.uid('f2b126_filer')),
  ('boletas', 'f2b126_q.pdf', pg_temp.uid('f2b126_filer')),
  ('boletas', 'f2b126_rec.pdf', NULL),
  ('boletas', 'f2b126_rf1.pdf', NULL),
  ('boletas', 'f2b126_rf2.pdf', NULL),
  ('boletas', 'f2b126_ns.pdf', pg_temp.uid('f2b126_nosubmit')),
  ('f2b126-other', 'f2b126_rf_other.pdf', NULL),
  ('boletas', 'f2b126_reuse.pdf', NULL),
  ('boletas', 'f2b126_reuse2.pdf', NULL),
  ('f2b126-other', 'f2b126/mine.png', pg_temp.uid('f2b126_learner_a')),
  ('course-materials', 'bibliography/f2b126/guia.pdf', NULL),
  ('course-assets', 'thumbnails/f2b126.png', NULL),
  ('instructor-photos', 'f2b126.png', NULL),
  ('f2b126-other', 'f2b126/o.txt', NULL);
SELECT set_config('storage.allow_delete_query', 'true', true);

CREATE OR REPLACE FUNCTION pg_temp.n(b text, nm text) RETURNS int LANGUAGE sql AS
  $$ SELECT count(*)::int FROM storage.objects WHERE bucket_id = b AND name = nm $$;
GRANT EXECUTE ON FUNCTION pg_temp.n(text, text) TO anon, authenticated, service_role;
-- Runs a query returning one integer; NULL instead of an error (so a missing
-- table or function fails its assertion instead of aborting the file).
CREATE OR REPLACE FUNCTION pg_temp.try_int(q text) RETURNS int LANGUAGE plpgsql AS
  $$ DECLARE r int; BEGIN EXECUTE q INTO r; RETURN r; EXCEPTION WHEN others THEN RETURN NULL; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.try_int(text) TO anon, authenticated, service_role;
-- The server's record of who a receipt the assistant stored belongs to,
-- written through its only writer (as lib/bots/expense-service.ts does with
-- the service key).
SELECT ok(public.record_expense_receipt_file('f2b126_svc.pdf', pg_temp.uid('f2b126_filer'))
          AND public.record_expense_receipt_file('f2b126_rec.pdf', pg_temp.uid('f2b126_filer'))
          AND public.record_expense_receipt_file('f2b126_reuse.pdf', pg_temp.uid('f2b126_filer'))
          AND public.record_expense_receipt_file('f2b126_reuse2.pdf', pg_temp.uid('f2b126_filer')),
  'fixtures: four ownerless receipts recorded for the filer');
SELECT set_config('f2b126.filer', pg_temp.uid('f2b126_filer')::text, true);
SELECT set_config('f2b126.access2', pg_temp.uid('f2b126_access2')::text, true);

-- ---------------------------------------------------------------------------
-- 2. Visitor (anon, no claims)
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'facturas'), 0, 'visitor lists 0 rows in facturas');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'resources'), 0, 'visitor lists 0 rows in resources');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignments'), 0, 'visitor lists 0 rows in assignments');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas'), 0, 'visitor lists 0 rows in boletas');
-- N124 (20261116179800): a visitor lists no store at all (these three were 1 under F2b alone).
SELECT is(pg_temp.n('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-1.png'), 0, 'visitor no longer lists community-images (N124)');
SELECT is(pg_temp.n('course-materials', 'bibliography/f2b126/guia.pdf'), 0, 'visitor no longer lists course-materials (N124)');
SELECT is(pg_temp.n('f2b126-other', 'f2b126/o.txt'), 0, 'visitor no longer reads an ungoverned bucket (N124)');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('instructor-photos', 'f2b126-v.png')$$,
  '42501', NULL, 'visitor cannot upload instructor photos (Production allowed it)');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('f2b126-other', 'f2b126/v.txt')$$,
  '42501', NULL, 'visitor cannot upload to an ungoverned bucket either');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'f2b126-other' RETURNING 1)
SELECT is(count(*)::int, 0, 'visitor cannot update in an ungoverned bucket') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'f2b126-other' RETURNING 1)
SELECT is(count(*)::int, 0, 'visitor cannot delete in an ungoverned bucket') FROM d;
SELECT is(public.file_store_allows('community-images', 'community-images/x.png', NULL, 'select', NULL), false,
  'visitor: community-images select is FALSE (N124)');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. facturas: admin only
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_member');
SELECT is(pg_temp.n('facturas', 'invoice_f2b126_1.pdf'), 0, 'non-admin cannot list facturas');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('facturas', 'invoice_m.pdf', auth.uid())$$,
  '42501', NULL, 'non-admin cannot upload to facturas');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'facturas' RETURNING 1)
SELECT is(count(*)::int, 0, 'non-admin cannot update facturas') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'facturas' RETURNING 1)
SELECT is(count(*)::int, 0, 'non-admin cannot delete facturas') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
SELECT is(pg_temp.n('facturas', 'invoice_f2b126_1.pdf'), 1, 'admin lists facturas');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('facturas', 'invoice_admin.pdf', auth.uid())$$,
  'admin uploads to facturas');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'facturas' AND name = 'invoice_admin.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'admin updates facturas') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'facturas' AND name = 'invoice_admin.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'admin deletes from facturas') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 4. resources
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_member');
SELECT is(pg_temp.n('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf'), 1,
  'workspace member lists their workspace documents');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                  VALUES ('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/nuevo.pdf', auth.uid())$$,
  'workspace member uploads a document to their workspace');
SELECT is(pg_temp.n('resources', 'documents/12600000-0000-4000-8000-0000000000b2/root/f2b126.pdf'), 0,
  'workspace member cannot list another workspace''s documents');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                   VALUES ('resources', 'documents/12600000-0000-4000-8000-0000000000b2/root/x.pdf', auth.uid())$$,
  '42501', NULL, 'workspace member cannot upload into another workspace');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'resources' AND name = 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'workspace member cannot update a document (even their own upload)') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'resources' AND name = 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'workspace member cannot delete a document') FROM d;
SELECT is(pg_temp.n('resources', 'images/f2b126.png'), 0, 'non-admin cannot list lesson images');
SELECT is(pg_temp.n('resources', 'Equipo/f2b126.png'), 0, 'non-admin cannot list site pictures');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources', 'images/m.png', auth.uid())$$,
  '42501', NULL, 'non-admin cannot upload a lesson image');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources', 'news-images/m.png', auth.uid())$$,
  '42501', NULL, 'a workspace member who is not a community manager cannot upload a news picture');
SELECT lives_ok($$SELECT public.file_store_allows('resources', 'documents/no-es-uuid/root/x.pdf', NULL, 'select', NULL)$$,
  'malformed documents/ path: no error');
SELECT is(public.file_store_allows('resources', 'documents/no-es-uuid/root/x.pdf', NULL, 'insert', NULL), false,
  'malformed documents/ path gives FALSE');
SELECT is(public.file_store_allows('resources', 'documents', NULL, 'select', NULL), false, 'bare documents name gives FALSE');
SELECT is(public.file_store_allows('community-images', 'community-images/zz-1.png', NULL, 'update', NULL), false,
  'malformed community-images key gives FALSE');
SELECT is(public.file_store_allows('resources', 'images/x.png', NULL, 'bogus', NULL), false, 'unknown action gives FALSE');
SELECT is(public.file_store_allows(NULL, NULL, NULL, 'select', NULL), true, 'NULL bucket is not governed: TRUE');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_member2');
SELECT is(pg_temp.n('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf'), 1,
  'second workspace member lists the first member''s document');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_out');
SELECT is(pg_temp.n('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf'), 0,
  'leadership of another school cannot list the workspace documents');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                   VALUES ('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/o.pdf', auth.uid())$$,
  '42501', NULL, 'leadership of another school cannot upload into the workspace');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_cm');
SELECT is(pg_temp.n('resources', 'news-images/f2b126.png'), 1, 'community manager lists news pictures');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources', 'news-images/cm.png', auth.uid())$$,
  'community manager uploads a news picture');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'resources' AND name = 'news-images/cm.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'community manager cannot update a news picture') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'resources' AND name LIKE 'news-images/%' RETURNING 1)
SELECT is(count(*)::int, 0, 'community manager cannot delete news pictures') FROM d;
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources', 'images/cm.png', auth.uid())$$,
  '42501', NULL, 'community manager cannot upload a lesson image');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'resources' AND name LIKE '%f2b126%'), 5,
  'admin lists every resources object');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources', 'images/admin.png', auth.uid())$$,
  'admin uploads a lesson image');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'resources' AND name = 'images/admin.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'admin deletes a lesson image') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 5. assignments
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_learner_a');
SELECT is(pg_temp.n('assignments', 'group-submissions/12600000-0000-4000-8000-0000000000a1/12600000-0000-4000-8000-0000000000d1/f2b126.pdf'), 1,
  'learner lists their own group work');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                  VALUES ('assignments', 'group-submissions/12600000-0000-4000-8000-0000000000a1/12600000-0000-4000-8000-0000000000d1/2.pdf', auth.uid())$$,
  'learner uploads group work');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'assignments' RETURNING 1)
SELECT is(count(*)::int, 0, 'learner cannot update group work (admin only)') FROM u;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_learner_b');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignments'), 0, 'another learner lists no one else''s group work');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                  VALUES ('assignments', 'group-submissions/12600000-0000-4000-8000-0000000000a1/12600000-0000-4000-8000-0000000000d2/b.pdf', auth.uid())$$,
  'another learner still uploads into their own group folder');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'assignments' AND owner IS DISTINCT FROM auth.uid() RETURNING 1)
SELECT is(count(*)::int, 0, 'another learner cannot delete someone else''s group work') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'assignments'), 3, 'admin lists all group work');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'assignments' AND name LIKE '%/b.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'admin deletes group work') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 6. community-images
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_out');
SELECT is(pg_temp.n('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-1.png'), 1,
  'any signed-in person lists community pictures (unchanged)');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('community-images', 'community-images/otro-1.png', auth.uid())$$,
  'any signed-in person uploads a community picture (unchanged)');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-1.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'a person outside the workspace cannot replace its picture') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-1.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'a person outside the workspace cannot delete its picture') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- Send-back 1 (R5): replace and delete follow community_workspaces' own rule:
-- admin, or an active community_manager of THAT workspace's community.
SELECT tests.authenticate_as('f2b126_member2');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-1.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'a plain member of the community cannot replace its picture') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-2.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'a plain member of the community cannot delete its picture') FROM d;
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                  VALUES ('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-9.png', auth.uid())$$,
  'a plain member still uploads a NEW community picture key (insert unchanged)');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_cm2');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-1.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'a community manager of ANOTHER community cannot replace the picture') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-2.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'a community manager of ANOTHER community cannot delete the picture') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_cm');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-1.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'the community''s own community manager replaces its picture') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-2.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'the community''s own community manager deletes its picture') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-3.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'the admin replaces a community picture') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-4.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'the admin deletes a community picture') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 7. boletas
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_filer');
SELECT is(pg_temp.n('boletas', 'f2b126_own.pdf'), 1, 'filer reads their own upload');
SELECT is(pg_temp.n('boletas', 'f2b126_svc.pdf'), 1, 'filer reads the assistant''s receipt the server recorded for them');
SELECT is(pg_temp.n('boletas', 'f2b126_link.pdf'), 0,
  'an ownerless receipt with no server record stays admin-only, even if the filer''s expense links it (accepted)');
SELECT is(pg_temp.n('boletas', 'f2b126_unlinked.pdf'), 0, 'filer cannot read a receipt not on their expenses');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('boletas', 'f2b126_new.pdf', auth.uid())$$,
  'filer uploads a receipt');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'boletas' AND name = 'f2b126_new.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'filer (owner, filing role) updates their own upload') FROM u;
WITH u AS (UPDATE storage.objects SET name = 'f2b126_new2.pdf' WHERE bucket_id = 'boletas' AND name = 'f2b126_new.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'move: filer with a filing role renames their own receipt within boletas') FROM u;
WITH u AS (UPDATE storage.objects SET name = 'f2b126_new.pdf' WHERE bucket_id = 'boletas' AND name = 'f2b126_new2.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'move: and renames it back') FROM u;
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'boletas' AND name = 'f2b126_svc.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'filer cannot update a linked receipt they did not upload') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_new.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'filer deletes their own upload') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_access2');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas'), 0,
  'a second person with expense access lists none of the filer''s receipts');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' RETURNING 1)
SELECT is(count(*)::int, 0, 'a second person with expense access deletes nothing') FROM d;
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('boletas', 'f2b126_acc.pdf', auth.uid())$$,
  'a second person with expense access still uploads their own receipt');
-- Send-back 1: text a filer can write is never proof. B writes A's exact
-- receipt names into an expense of B's own (the row rules allow it) ...
SELECT lives_ok($$INSERT INTO public.expense_items (report_id, description, amount, expense_date, receipt_url) VALUES
  ('12600000-0000-4000-8000-0000000000e2', 'F2b 126 B lugar', 10, '2027-02-01', 'boletas/f2b126_a_secret.pdf'),
  ('12600000-0000-4000-8000-0000000000e2', 'F2b 126 B enlace', 10, '2027-02-01',
   'http://127.0.0.1:54321/storage/v1/object/sign/boletas/f2b126_a_secret2.pdf?token=x'),
  ('12600000-0000-4000-8000-0000000000e2', 'F2b 126 B prefijo', 10, '2027-02-01',
   'http://127.0.0.1:54321/storage/v1/object/sign/boletas/f2b126_scan.pdf.backup?token=x'),
  ('12600000-0000-4000-8000-0000000000e2', 'F2b 126 B consulta', 10, '2027-02-01',
   'http://127.0.0.1:54321/storage/v1/object/sign/boletas/f2b126_acc.pdf?token=x&ref=/boletas/f2b126_q.pdf')$$,
  'B writes A''s receipt names into an expense of B''s own with B''s session');
-- ... and still cannot list, sign or delete A's files.
SELECT is(pg_temp.n('boletas', 'f2b126_a_secret.pdf'), 0, 'B cannot list A''s receipt named boletas/<name> in B''s expense');
SELECT is(pg_temp.n('boletas', 'f2b126_a_secret2.pdf'), 0, 'B cannot list A''s receipt named by an old link in B''s expense');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_a_secret.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'B cannot delete A''s receipt named boletas/<name> in B''s expense') FROM d;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_a_secret2.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'B cannot delete A''s receipt named by an old link in B''s expense') FROM d;
SELECT is(pg_temp.n('boletas', 'f2b126_scan.pdf'), 0, 'prefix: B''s link to scan.pdf.backup does not reveal A''s scan.pdf');
SELECT is(pg_temp.n('boletas', 'f2b126_q.pdf'), 0, 'query string: a name inside B''s link''s query does not reveal A''s file');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name IN ('f2b126_scan.pdf', 'f2b126_q.pdf') RETURNING 1)
SELECT is(count(*)::int, 0, 'B cannot delete A''s files reached by prefix or query string') FROM d;
SELECT is(pg_temp.n('boletas', 'f2b126_rec.pdf'), 0, 'B cannot see an ownerless receipt the server recorded for A');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_rec.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'B cannot delete an ownerless receipt the server recorded for A') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas'
            AND name IN ('f2b126_a_secret.pdf', 'f2b126_a_secret2.pdf', 'f2b126_scan.pdf', 'f2b126_q.pdf', 'f2b126_rec.pdf')), 5,
  'A''s five files are all still there');

-- The record: nobody but the service role reads or writes it.
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.expense_receipt_files$$, '42501', NULL, 'visitor cannot read expense_receipt_files');
SELECT throws_ok($$INSERT INTO public.expense_receipt_files (object_id, object_name, user_id, source) VALUES (gen_random_uuid(), 'x.pdf', gen_random_uuid(), 'assistant')$$,
  '42501', NULL, 'visitor cannot write expense_receipt_files');
RESET ROLE;
SELECT tests.authenticate_as('f2b126_filer');
SELECT throws_ok($$SELECT count(*) FROM public.expense_receipt_files$$, '42501', NULL, 'signed-in person cannot read expense_receipt_files');
SELECT throws_ok($$INSERT INTO public.expense_receipt_files (object_id, object_name, user_id, source)
                   SELECT gen_random_uuid(), 'f2b126_a_secret.pdf', auth.uid(), 'assistant'$$,
  '42501', NULL, 'signed-in person cannot record a file for themselves');
SELECT throws_ok($$DELETE FROM public.expense_receipt_files$$, '42501', NULL, 'signed-in person cannot delete from expense_receipt_files');
SELECT throws_ok($$UPDATE public.expense_receipt_files SET user_id = auth.uid()$$, '42501', NULL, 'signed-in person cannot update expense_receipt_files');
-- A file with a row for A and no owner: A sees and deletes it; A cannot update it.
SELECT is(pg_temp.n('boletas', 'f2b126_rec.pdf'), 1, 'A sees the ownerless receipt the server recorded for A');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'boletas' AND name = 'f2b126_rec.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'A cannot update the recorded receipt (update is owner or admin)') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_rec.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'A deletes the ownerless receipt the server recorded for A') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();
-- The recording function: the only writer of expense_receipt_files.
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.record_expense_receipt_file('f2b126_rf1.pdf', gen_random_uuid())$$, '42501', NULL,
  'visitor cannot call record_expense_receipt_file');
RESET ROLE;
SELECT tests.authenticate_as('f2b126_filer');
SELECT throws_ok($$SELECT public.record_expense_receipt_file('f2b126_rf1.pdf', auth.uid())$$, '42501', NULL,
  'a signed-in person cannot call record_expense_receipt_file (not even for themselves)');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT is(public.record_expense_receipt_file('f2b126_rf1.pdf', current_setting('f2b126.filer')::uuid), true,
  'record: an ownerless boletas object -> true');
SELECT is((SELECT count(*)::int FROM public.expense_receipt_files f JOIN storage.objects o ON o.id = f.object_id
            WHERE o.bucket_id = 'boletas' AND o.name = 'f2b126_rf1.pdf' AND f.object_name = 'f2b126_rf1.pdf'
              AND f.user_id = current_setting('f2b126.filer')::uuid AND f.source = 'assistant'), 1,
  'record: one row, with that object''s id, for that person, source assistant');
SELECT is(public.record_expense_receipt_file('f2b126_nope.pdf', current_setting('f2b126.filer')::uuid), false,
  'record: a name that does not exist -> false');
SELECT is((SELECT count(*)::int FROM public.expense_receipt_files WHERE object_name = 'f2b126_nope.pdf'), 0,
  'record: no row for a name that does not exist');
SELECT is(public.record_expense_receipt_file('f2b126_own.pdf', current_setting('f2b126.filer')::uuid), false,
  'record: an object that HAS an owner -> false');
SELECT is(public.record_expense_receipt_file('f2b126_rf_other.pdf', current_setting('f2b126.filer')::uuid), false,
  'record: an ownerless object of that name in ANOTHER bucket -> false');
SELECT is((SELECT count(*)::int FROM public.expense_receipt_files WHERE object_name IN ('f2b126_own.pdf', 'f2b126_rf_other.pdf')), 0,
  'record: no row for an owned object or another bucket''s object');
SELECT is(public.record_expense_receipt_file('f2b126_rf1.pdf', current_setting('f2b126.filer')::uuid), true,
  'record: a second call for the same object and person -> true');
SELECT is(public.record_expense_receipt_file('f2b126_rf1.pdf', current_setting('f2b126.access2')::uuid), false,
  'record: the same object for ANOTHER person -> false');
SELECT is((SELECT array_agg(user_id)::text FROM public.expense_receipt_files WHERE object_name = 'f2b126_rf1.pdf'),
  ARRAY[current_setting('f2b126.filer')::uuid]::text,
  'record: still one row, still the first person');
SELECT is(public.record_expense_receipt_file('f2b126_rf2.pdf', NULL), false, 'record: a null person -> false');
SELECT is(public.record_expense_receipt_file('f2b126_rf2.pdf', gen_random_uuid()), false, 'record: a person with no profile -> false');
SELECT is((SELECT count(*)::int FROM public.expense_receipt_files WHERE object_name = 'f2b126_rf2.pdf'), 0,
  'record: no row for a null or unknown person');
-- The table, for the service role: SELECT and DELETE, never INSERT or UPDATE.
SELECT throws_ok($$INSERT INTO public.expense_receipt_files (object_id, object_name, user_id, source)
                   SELECT id, name, current_setting('f2b126.access2')::uuid, 'assistant' FROM storage.objects
                    WHERE bucket_id = 'boletas' AND name = 'f2b126_rf2.pdf'$$, '42501', NULL,
  'service_role cannot INSERT into expense_receipt_files directly');
SELECT throws_ok($$UPDATE public.expense_receipt_files SET user_id = current_setting('f2b126.access2')::uuid$$, '42501', NULL,
  'service_role cannot UPDATE expense_receipt_files');
SELECT is(pg_temp.try_int($$SELECT count(*)::int FROM public.expense_receipt_files WHERE object_name = 'f2b126_svc.pdf'$$), 1,
  'service_role reads expense_receipt_files');
SELECT ok(public.record_expense_receipt_file('f2b126_rf2.pdf', current_setting('f2b126.filer')::uuid), 'record: rf2 for the filer');
WITH d AS (DELETE FROM public.expense_receipt_files WHERE object_name = 'f2b126_rf2.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'service_role deletes a row of expense_receipt_files') FROM d;
RESET ROLE;
SELECT tests.authenticate_as('f2b126_filer');
SELECT is(pg_temp.n('boletas', 'f2b126_rf1.pdf'), 1, 'the recorded person sees (and so may sign) their recorded ownerless file');
SELECT is(pg_temp.n('boletas', 'f2b126_rf2.pdf'), 0, 'a deleted record gives nothing');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT tests.authenticate_as('f2b126_access2');
SELECT is(pg_temp.n('boletas', 'f2b126_rf1.pdf'), 0, 'another person with expense access sees nothing of it');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_rf1.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'another person with expense access cannot delete it') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- No filing role (a docente with an access row, can_submit = false): owns a
-- receipt, may not read, move or update it (F7d: the store follows the role).
SELECT tests.authenticate_as('f2b126_nosubmit');
SELECT is(pg_temp.n('boletas', 'f2b126_ns.pdf'), 0, 'owner without a filing role no longer reads their own receipt (F7d)');
WITH u AS (UPDATE storage.objects SET name = 'f2b126_ns2.pdf' WHERE bucket_id = 'boletas' AND name = 'f2b126_ns.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'move: owner without a filing role cannot rename within boletas') FROM u;
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.n('boletas', 'f2b126_ns.pdf'), 1, 'move: that receipt keeps its name');

SELECT tests.authenticate_as('f2b126_out');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('boletas', 'f2b126_out.pdf', auth.uid())$$,
  '42501', NULL, 'a person without expense access cannot upload receipts (Production rule)');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT set_config('f2b126.boletas_n', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'boletas')::text, true);
SELECT tests.authenticate_as('f2b126_admin');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas'), current_setting('f2b126.boletas_n')::int,
  'admin lists every receipt');
SELECT is(pg_temp.n('boletas', 'f2b126_link.pdf'), 1, 'an ownerless receipt with no record is visible to the admin');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_unlinked.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'admin deletes a receipt') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 7b. Send-back 2: a record belongs to the file itself, not to its name (b);
--     a move into boletas needs expense access (c)
-- ---------------------------------------------------------------------------
-- (b) A's two recorded ownerless receipts are deleted; new files take the
-- same names: one uploaded by B (owner B), one ownerless.
DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name IN ('f2b126_reuse.pdf', 'f2b126_reuse2.pdf');
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('boletas', 'f2b126_reuse.pdf', pg_temp.uid('f2b126_access2')),
  ('boletas', 'f2b126_reuse2.pdf', NULL);
SELECT tests.authenticate_as('f2b126_filer');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas' AND name IN ('f2b126_reuse.pdf', 'f2b126_reuse2.pdf')), 0,
  'name reuse: A sees neither new file that took the name of A''s deleted recorded receipt');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name IN ('f2b126_reuse.pdf', 'f2b126_reuse2.pdf') RETURNING 1)
SELECT is(count(*)::int, 0, 'name reuse: A deletes neither new file') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas' AND name IN ('f2b126_reuse.pdf', 'f2b126_reuse2.pdf')), 2,
  'name reuse: both new files are still there');
-- (c) a person with NO expense access moves a file they own into boletas
SELECT tests.authenticate_as('f2b126_learner_a');
SELECT is(coalesce(pg_temp.try_int($$WITH u AS (UPDATE storage.objects SET bucket_id = 'boletas', name = 'f2b126_moved.png'
                                            WHERE bucket_id = 'f2b126-other' AND name = 'f2b126/mine.png' RETURNING 1)
                                     SELECT count(*)::int FROM u$$), 0), 0,
  'move: a person with no expense access cannot move their own file into boletas (0 rows or 42501)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT ok(pg_temp.n('f2b126-other', 'f2b126/mine.png') = 1 AND pg_temp.n('boletas', 'f2b126_moved.png') = 0,
  'move: the file is still where it was, nothing in boletas');

-- ---------------------------------------------------------------------------
-- 8. course-materials, course-assets, instructor-photos, contracts
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_learner_a');
SELECT is(pg_temp.n('course-materials', 'bibliography/f2b126/guia.pdf'), 1, 'signed-in person still lists course materials');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-materials', 'bibliography/f2b126/l.pdf', auth.uid())$$,
  '42501', NULL, 'non-admin cannot upload course materials');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-assets', 'thumbnails/l.png', auth.uid())$$,
  '42501', NULL, 'non-admin cannot upload course assets');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('instructor-photos', 'l.png', auth.uid())$$,
  '42501', NULL, 'non-admin cannot upload instructor photos');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'insert', NULL), false, 'non-admin: contracts insert FALSE');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'select', NULL), true, 'non-admin: contracts select unchanged');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-materials', 'bibliography/f2b126/a.pdf', auth.uid())$$,
  'admin uploads course materials');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-assets', 'thumbnails/a.png', auth.uid())$$,
  'admin uploads course assets');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('instructor-photos', 'a.png', auth.uid())$$,
  'admin uploads instructor photos');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'delete', NULL), true, 'admin: contracts delete TRUE');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 9. Ungoverned bucket, signed in: as before
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_out');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('f2b126-other', 'f2b126/s.txt', auth.uid())$$,
  'signed-in person uploads to an ungoverned bucket');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'f2b126-other' AND name = 'f2b126/o.txt' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in person updates in an ungoverned bucket') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'f2b126-other' AND name = 'f2b126/s.txt' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in person deletes in an ungoverned bucket') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 9b. Moves (UPDATE of bucket_id / name, as the file service's move does)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_member');
WITH u AS (UPDATE storage.objects SET name = 'images/f2b126-movido.pdf'
            WHERE bucket_id = 'resources' AND name = 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'move: a workspace member cannot move their document into images/') FROM u;
WITH u AS (UPDATE storage.objects SET name = 'documents/12600000-0000-4000-8000-0000000000b1/root/robado.pdf'
            WHERE bucket_id = 'resources' AND name = 'documents/12600000-0000-4000-8000-0000000000b2/root/f2b126.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'move: a member cannot pull another workspace''s document under their own folder') FROM u;
RESET ROLE;
SELECT tests.clear_authentication();
SELECT tests.authenticate_as('f2b126_out');
SELECT throws_ok($$UPDATE storage.objects SET bucket_id = 'facturas' WHERE bucket_id = 'f2b126-other' AND name = 'f2b126/o.txt'$$,
  '42501', NULL, 'move: a file of an ungoverned bucket cannot be moved into facturas');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM storage.objects WHERE (bucket_id, name) IN
            (('resources', 'documents/12600000-0000-4000-8000-0000000000b1/root/f2b126.pdf'),
             ('resources', 'documents/12600000-0000-4000-8000-0000000000b2/root/f2b126.pdf'),
             ('f2b126-other', 'f2b126/o.txt'))), 3, 'move: the three files are where they were');

-- ---------------------------------------------------------------------------
-- 10. Service role: unaffected
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'facturas'), 1, 'service_role lists facturas');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('facturas', 'invoice_svc.pdf'), ('boletas', 'f2b126_bot.pdf')$$,
  'service_role uploads to facturas and boletas');
WITH d AS (DELETE FROM storage.objects WHERE (bucket_id, name) IN (('facturas', 'invoice_svc.pdf'), ('boletas', 'f2b126_bot.pdf')) RETURNING 1)
SELECT is(count(*)::int, 2, 'service_role deletes from facturas and boletas') FROM d;
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
