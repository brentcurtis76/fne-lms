-- =============================================================================
-- 130-visitors-list-no-store.sql — GENERA fixes, level 2 (N124):
-- migration 20261116179800_visitors_list_no_store.sql.
--
-- public.file_store_allows (20261116178000) refused a visitor every write but
-- refused listing only in facturas, resources, assignments and boletas. Decided:
-- a visitor never lists any store. The function gains ONE rule (a visitor's
-- 'select' is FALSE in every bucket); no rule on storage.objects changes.
--
-- Fixtures: the seven stores below and, verbatim from the catalogue model of
-- Production (tools/storage-model.sql), Production's permissive rules for them
-- (created only when a rule of that name does not already exist); one invented
-- signed-in person; objects inserted as postgres.
-- Before the migration a visitor lists the fixture rows of course-materials,
-- post-media, community-images, feedback-screenshots and instructor-photos
-- (their model rules let the public role read). course-assets has no model read
-- rule and the avatars rule needs auth.uid(), so a visitor already listed 0 there;
-- they are asserted so the decision ("no store") stays pinned.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(22);

-- ---------------------------------------------------------------------------
-- 1. Catalog: the function's security settings and grants are unchanged
-- ---------------------------------------------------------------------------
SELECT ok((SELECT prosecdef AND provolatile = 's' AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
             FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure),
  'file_store_allows is still plpgsql, STABLE, SECURITY DEFINER');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure),
  ARRAY['search_path=public, pg_temp'], 'file_store_allows still pins search_path = public, pg_temp');
SELECT ok(has_function_privilege('anon', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE'), 'anon still may execute file_store_allows');
SELECT ok(has_function_privilege('authenticated', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE'), 'authenticated still may execute file_store_allows');
SELECT ok(has_function_privilege('service_role', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE'), 'service_role still may execute file_store_allows');
SELECT is((SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
            WHERE p.oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure AND a.grantee = 0), 0,
  'PUBLIC still holds no EXECUTE on file_store_allows');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'file_store_allows'), 1,
  'one file_store_allows only (no second signature)');
SELECT is((SELECT array_agg(policyname || ':' || permissive || ':' || cmd ORDER BY policyname)::text FROM pg_policies
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND (coalesce(qual, '') LIKE '%file_store_allows(%' OR coalesce(with_check, '') LIKE '%file_store_allows(%')),
  '{file_stores_boundary_delete:RESTRICTIVE:DELETE,file_stores_boundary_insert:RESTRICTIVE:INSERT,file_stores_boundary_select:RESTRICTIVE:SELECT,file_stores_boundary_update:RESTRICTIVE:UPDATE}',
  'the same four restrictive rules call file_store_allows (none added or changed)');

-- ---------------------------------------------------------------------------
-- Fixtures (postgres, synthetic)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('course-materials', 'course-materials', true), ('course-assets', 'course-assets', true),
  ('post-media', 'post-media', true), ('community-images', 'community-images', true),
  ('feedback-screenshots', 'feedback-screenshots', true), ('instructor-photos', 'instructor-photos', true),
  ('avatars', 'avatars', true), ('f2b130-other', 'f2b130-other', true)
ON CONFLICT (id) DO NOTHING;

-- Production's permissive rules for these stores, verbatim from the model.
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admin upload access for instructor photos') THEN EXECUTE $p$CREATE POLICY "Admin upload access for instructor photos" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((bucket_id = 'instructor-photos'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins can manage all feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Admins can manage all feedback screenshots" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'feedback-screenshots'::text) AND (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_type = 'admin'::user_role_type) AND (user_roles.is_active = true))))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow uploads to course-assets') THEN EXECUTE $p$CREATE POLICY "Allow uploads to course-assets" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'course-assets'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anyone can view course materials') THEN EXECUTE $p$CREATE POLICY "Anyone can view course materials" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'course-materials'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anyone can view feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Anyone can view feedback screenshots" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'feedback-screenshots'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anyone can view feedback screenshots 1oj01fe_0') THEN EXECUTE $p$CREATE POLICY "Anyone can view feedback screenshots 1oj01fe_0" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'feedback-screenshots'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anyone can view post-media') THEN EXECUTE $p$CREATE POLICY "Anyone can view post-media" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'post-media'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload community images') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload community images" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload course materials') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload course materials" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'course-materials'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload feedback screenshots" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'feedback-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload to post-media') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload to post-media" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'post-media'::text) AND (auth.uid() IS NOT NULL)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public can view community images') THEN EXECUTE $p$CREATE POLICY "Public can view community images" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public read access for instructor photos') THEN EXECUTE $p$CREATE POLICY "Public read access for instructor photos" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'instructor-photos'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Users can delete own feedback screenshots" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'feedback-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own feedback screenshots 1oj01fe_0') THEN EXECUTE $p$CREATE POLICY "Users can delete own feedback screenshots 1oj01fe_0" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'feedback-screenshots'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own post-media') THEN EXECUTE $p$CREATE POLICY "Users can delete own post-media" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their community images') THEN EXECUTE $p$CREATE POLICY "Users can delete their community images" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own course materials') THEN EXECUTE $p$CREATE POLICY "Users can delete their own course materials" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'course-materials'::text) AND (owner = auth.uid())))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Users can delete their own feedback screenshots" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'feedback-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update own feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Users can update own feedback screenshots" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'feedback-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update own feedback screenshots 1oj01fe_0') THEN EXECUTE $p$CREATE POLICY "Users can update own feedback screenshots 1oj01fe_0" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'feedback-screenshots'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update own post-media') THEN EXECUTE $p$CREATE POLICY "Users can update own post-media" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their community images') THEN EXECUTE $p$CREATE POLICY "Users can update their community images" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING ((bucket_id = 'community-images'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their own course materials') THEN EXECUTE $p$CREATE POLICY "Users can update their own course materials" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'course-materials'::text) AND (owner = auth.uid())))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload and read their own avatars') THEN EXECUTE $p$CREATE POLICY "Users can upload and read their own avatars" ON storage.objects AS PERMISSIVE FOR ALL TO public USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = split_part(name, '/'::text, 1))))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Users can upload feedback screenshots" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'feedback-screenshots'::text) AND (auth.uid() IS NOT NULL) AND ((storage.foldername(name))[1] = 'feedback'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload feedback screenshots 1oj01fe_0') THEN EXECUTE $p$CREATE POLICY "Users can upload feedback screenshots 1oj01fe_0" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'feedback-screenshots'::text) AND ((storage.foldername(name))[1] = 'feedback'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can view their own feedback screenshots') THEN EXECUTE $p$CREATE POLICY "Users can view their own feedback screenshots" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'feedback-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;

SELECT tests.create_supabase_user('f2b130_docente');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;
INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
VALUES (pg_temp.uid('f2b130_docente'), 'f2b130_docente@f2b130.test.local', 'f2b130_docente', 'approved', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (913001, 'N124 school (pgTAP 130)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('f2b130_docente'), 'docente', 913001, true);

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('course-materials', 'bibliography/f2b130/guia-1.pdf', NULL),
  ('course-materials', 'group-tasks/f2b130/recurso-2.pdf', NULL),
  ('course-assets', 'thumbnails/f2b130-1.png', NULL),
  ('course-assets', 'thumbnails/f2b130-2.png', NULL),
  ('post-media', 'f2b130/post-1.png', NULL),
  ('post-media', 'f2b130/post-2.png', NULL),
  ('community-images', 'community-images/f2b130-1.png', NULL),
  ('community-images', 'community-images/f2b130-2.png', NULL),
  ('feedback-screenshots', 'feedback/f2b130/shot-1.png', NULL),
  ('feedback-screenshots', 'feedback/f2b130/shot-2.png', NULL),
  ('instructor-photos', 'f2b130-1.png', NULL),
  ('instructor-photos', 'f2b130-2.png', NULL),
  ('avatars', pg_temp.uid('f2b130_docente')::text || '/f2b130-1.png', pg_temp.uid('f2b130_docente')),
  ('avatars', pg_temp.uid('f2b130_docente')::text || '/f2b130-2.png', pg_temp.uid('f2b130_docente'));

CREATE OR REPLACE FUNCTION pg_temp.n(b text) RETURNS int LANGUAGE sql AS
  $$ SELECT count(*)::int FROM storage.objects WHERE bucket_id = b AND name LIKE '%f2b130%' $$;
GRANT EXECUTE ON FUNCTION pg_temp.n(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A visitor (anon, no claims) lists no store
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT is(pg_temp.n('course-materials'), 0, 'visitor lists 0 rows in course-materials');
SELECT is(pg_temp.n('course-assets'), 0, 'visitor lists 0 rows in course-assets');
SELECT is(pg_temp.n('post-media'), 0, 'visitor lists 0 rows in post-media');
SELECT is(pg_temp.n('community-images'), 0, 'visitor lists 0 rows in community-images');
SELECT is(pg_temp.n('feedback-screenshots'), 0, 'visitor lists 0 rows in feedback-screenshots');
SELECT is(pg_temp.n('instructor-photos'), 0, 'visitor lists 0 rows in instructor-photos');
SELECT is(pg_temp.n('avatars'), 0, 'visitor lists 0 rows in avatars');
SELECT is(public.file_store_allows('f2b130-other', 'f2b130/o.txt', NULL, 'select', NULL), false,
  'visitor: select in a bucket the function does not otherwise govern is FALSE');
SELECT is(public.file_store_allows(NULL, NULL, NULL, 'select', NULL), false,
  'visitor: select with no bucket is FALSE');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. A signed-in person lists exactly what they listed before
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f2b130_docente');
SELECT is(pg_temp.n('course-materials'), 2, 'signed-in person still lists both course-materials fixtures');
SELECT is(pg_temp.n('post-media'), 2, 'signed-in person still lists both post-media fixtures');

-- ---------------------------------------------------------------------------
-- 4. Governed stores unchanged (assertions taken from 126)
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'community-images' AND name = 'community-images/f2b130-1.png'), 1,
  'any signed-in person lists community pictures (unchanged)');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('course-materials', 'bibliography/f2b130/l.pdf', auth.uid())$$,
  '42501', NULL, 'non-admin cannot upload course materials');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('instructor-photos', 'f2b130-v.png')$$,
  '42501', NULL, 'visitor cannot upload instructor photos (Production allowed it)');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
