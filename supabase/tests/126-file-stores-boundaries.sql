-- =============================================================================
-- 126-file-stores-boundaries.sql — GENERA fixes F2b (GES-1.4, EC-S3, N17):
-- migration 20261116178000_file_stores_boundaries.sql.
--
-- One function, public.file_store_allows(bucket, name, owner, action), and four
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
--   boletas           insert unchanged; select, delete: admin, owner, or the
--                     receipt of an expense the caller filed; update: admin or owner
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
SELECT plan(102);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'file_store_allows'
                     AND pg_get_function_identity_arguments(p.oid) = 'p_bucket text, p_name text, p_owner uuid, p_action text'
                     AND p.prorettype = 'boolean'::regtype),
  'public.file_store_allows(text, text, uuid, text) returns boolean');
SELECT ok((SELECT prosecdef AND provolatile = 's' AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
             FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text)'::regprocedure),
  'file_store_allows is plpgsql, STABLE, SECURITY DEFINER');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text)'::regprocedure),
  ARRAY['search_path=public, pg_temp'], 'file_store_allows pins search_path = public, pg_temp');
SELECT ok(has_function_privilege('anon', 'public.file_store_allows(text, text, uuid, text)', 'EXECUTE'), 'anon may execute file_store_allows');
SELECT ok(has_function_privilege('authenticated', 'public.file_store_allows(text, text, uuid, text)', 'EXECUTE'), 'authenticated may execute file_store_allows');
SELECT ok(has_function_privilege('service_role', 'public.file_store_allows(text, text, uuid, text)', 'EXECUTE'), 'service_role may execute file_store_allows');
SELECT is((SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
            WHERE p.oid = 'public.file_store_allows(text, text, uuid, text)'::regprocedure AND a.grantee = 0), 0,
  'PUBLIC holds no EXECUTE on file_store_allows');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_select' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'SELECT' AND qual LIKE '%file_store_allows%'),
  'file_stores_boundary_select: RESTRICTIVE, TO public, FOR SELECT');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_insert' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'INSERT' AND with_check LIKE '%file_store_allows%'),
  'file_stores_boundary_insert: RESTRICTIVE, TO public, FOR INSERT');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_update' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'UPDATE'
                   AND qual LIKE '%file_store_allows%' AND with_check LIKE '%file_store_allows%'),
  'file_stores_boundary_update: RESTRICTIVE, TO public, FOR UPDATE (USING and WITH CHECK)');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_delete' AND permissive = 'RESTRICTIVE'
                   AND roles = ARRAY['public']::name[] AND cmd = 'DELETE' AND qual LIKE '%file_store_allows%'),
  'file_stores_boundary_delete: RESTRICTIVE, TO public, FOR DELETE');

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
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@f2b126.test.local', k, 'approved', false
  FROM unnest(ARRAY['f2b126_admin','f2b126_cm','f2b126_member','f2b126_member2','f2b126_out',
                    'f2b126_learner_a','f2b126_learner_b','f2b126_filer','f2b126_access2']) k
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
  (pg_temp.uid('f2b126_cm'),        'community_manager', 912601, NULL, true),
  (pg_temp.uid('f2b126_member'),    'docente',           912601, '12600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f2b126_member2'),   'lider_comunidad',   912601, '12600000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f2b126_out'),       'equipo_directivo',  912602, NULL, true),
  (pg_temp.uid('f2b126_learner_a'), 'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_learner_b'), 'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_filer'),     'docente',           912601, NULL, true),
  (pg_temp.uid('f2b126_access2'),   'docente',           912601, NULL, true);
INSERT INTO public.expense_report_access (user_id, can_submit, granted_by, notes) VALUES
  (pg_temp.uid('f2b126_filer'),   true, pg_temp.uid('f2b126_admin'), 'F2b 126 sintetico'),
  (pg_temp.uid('f2b126_access2'), true, pg_temp.uid('f2b126_admin'), 'F2b 126 sintetico')
ON CONFLICT (user_id) DO UPDATE SET can_submit = true;
INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status) VALUES
  ('12600000-0000-4000-8000-0000000000e1', 'F2b 126 rendicion sintetica', '2027-02-01', '2027-02-02', pg_temp.uid('f2b126_filer'), 'draft');
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
  ('boletas', 'f2b126_own.pdf', pg_temp.uid('f2b126_filer')),
  ('boletas', 'f2b126_svc.pdf', NULL),
  ('boletas', 'f2b126_link.pdf', NULL),
  ('boletas', 'f2b126_unlinked.pdf', NULL),
  ('course-materials', 'bibliography/f2b126/guia.pdf', NULL),
  ('course-assets', 'thumbnails/f2b126.png', NULL),
  ('instructor-photos', 'f2b126.png', NULL),
  ('f2b126-other', 'f2b126/o.txt', NULL);
SELECT set_config('storage.allow_delete_query', 'true', true);

CREATE OR REPLACE FUNCTION pg_temp.n(b text, nm text) RETURNS int LANGUAGE sql AS
  $$ SELECT count(*)::int FROM storage.objects WHERE bucket_id = b AND name = nm $$;
GRANT EXECUTE ON FUNCTION pg_temp.n(text, text) TO anon, authenticated, service_role;

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
SELECT is(pg_temp.n('community-images', 'community-images/12600000-0000-4000-8000-0000000000b1-1.png'), 1, 'visitor still lists community-images (unchanged)');
SELECT is(pg_temp.n('course-materials', 'bibliography/f2b126/guia.pdf'), 1, 'visitor still lists course-materials (unchanged)');
SELECT is(pg_temp.n('f2b126-other', 'f2b126/o.txt'), 1, 'visitor still reads an ungoverned bucket');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('instructor-photos', 'f2b126-v.png')$$,
  '42501', NULL, 'visitor cannot upload instructor photos (Production allowed it)');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('f2b126-other', 'f2b126/v.txt')$$,
  '42501', NULL, 'visitor cannot upload to an ungoverned bucket either');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'f2b126-other' RETURNING 1)
SELECT is(count(*)::int, 0, 'visitor cannot update in an ungoverned bucket') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'f2b126-other' RETURNING 1)
SELECT is(count(*)::int, 0, 'visitor cannot delete in an ungoverned bucket') FROM d;
SELECT is(public.file_store_allows('community-images', 'community-images/x.png', NULL, 'select'), true,
  'visitor: community-images select stays TRUE');
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
SELECT lives_ok($$SELECT public.file_store_allows('resources', 'documents/no-es-uuid/root/x.pdf', NULL, 'select')$$,
  'malformed documents/ path: no error');
SELECT is(public.file_store_allows('resources', 'documents/no-es-uuid/root/x.pdf', NULL, 'insert'), false,
  'malformed documents/ path gives FALSE');
SELECT is(public.file_store_allows('resources', 'documents', NULL, 'select'), false, 'bare documents name gives FALSE');
SELECT is(public.file_store_allows('community-images', 'community-images/zz-1.png', NULL, 'update'), false,
  'malformed community-images key gives FALSE');
SELECT is(public.file_store_allows('resources', 'images/x.png', NULL, 'bogus'), false, 'unknown action gives FALSE');
SELECT is(public.file_store_allows(NULL, NULL, NULL, 'select'), true, 'NULL bucket is not governed: TRUE');
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

SELECT tests.authenticate_as('f2b126_member2');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-1.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'a person of the workspace replaces its picture') FROM u;
WITH d AS (DELETE FROM storage.objects
            WHERE bucket_id = 'community-images' AND name = 'community-images/12600000-0000-4000-8000-0000000000b1-2.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'a person of the workspace deletes its picture') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 7. boletas
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b126_filer');
SELECT is(pg_temp.n('boletas', 'f2b126_own.pdf'), 1, 'filer reads their own upload');
SELECT is(pg_temp.n('boletas', 'f2b126_svc.pdf'), 1, 'filer reads a receipt linked as boletas/<file> on their expense');
SELECT is(pg_temp.n('boletas', 'f2b126_link.pdf'), 1, 'filer reads a receipt linked by an old link on their expense');
SELECT is(pg_temp.n('boletas', 'f2b126_unlinked.pdf'), 0, 'filer cannot read a receipt not on their expenses');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('boletas', 'f2b126_new.pdf', auth.uid())$$,
  'filer uploads a receipt');
WITH u AS (UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'boletas' AND name = 'f2b126_new.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'filer updates their own upload') FROM u;
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
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_out');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('boletas', 'f2b126_out.pdf', auth.uid())$$,
  '42501', NULL, 'a person without expense access cannot upload receipts (Production rule)');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'boletas'), 5, 'admin lists every receipt');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'boletas' AND name = 'f2b126_unlinked.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'admin deletes a receipt') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

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
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'insert'), false, 'non-admin: contracts insert FALSE');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'select'), true, 'non-admin: contracts select unchanged');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('f2b126_admin');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-materials', 'bibliography/f2b126/a.pdf', auth.uid())$$,
  'admin uploads course materials');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-assets', 'thumbnails/a.png', auth.uid())$$,
  'admin uploads course assets');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('instructor-photos', 'a.png', auth.uid())$$,
  'admin uploads instructor photos');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'delete'), true, 'admin: contracts delete TRUE');
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
