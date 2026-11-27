-- =============================================================================
-- 179-espacio-files-private.sql — GENERA fixes F26b (EC-F1):
-- migration 20261125102000_espacio_files_private.sql.
--
-- Espacio Colaborativo's two file stores, `post-media` (feed pictures and
-- documents) and `message-attachments` (message attachments), were not governed
-- by public.file_store_allows (its ELSE answered true), so the older permissive
-- rules let any signed-in person of any community list and read every file.
-- Decided (owner 20 Nov 2026, "Yes, private"): nobody lists or reads these two
-- stores with their own session; files open only through the application's
-- five-minute links. Uploads, replacements and removals stay with the existing
-- permissive rules; a visitor still does nothing.
--
-- Fixtures: the stores created PUBLIC (as in Production) and, verbatim from the
-- catalogue model of Production (supabase/tests/130-visitors-list-no-store.sql
-- and tools/storage-model.sql), Production's permissive rules (created only when
-- a rule of that name does not already exist); one invented signed-in person;
-- invented objects inserted as postgres.
-- Before the migration the signed-in person lists and reads both fixtures of
-- each store and the function answers 'select' TRUE for both stores.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(35);

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
  ('post-media', 'post-media', true), ('message-attachments', 'message-attachments', true),
  ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- Production's permissive rules, verbatim from the model (130 and tools/storage-model.sql).
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
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow authenticated users to upload attachments 1rb83je_0') THEN EXECUTE $p$CREATE POLICY "Allow authenticated users to upload attachments 1rb83je_0" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'message-attachments'::text) AND (auth.role() = 'authenticated'::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow users to delete own attachments 1rb83je_0') THEN EXECUTE $p$CREATE POLICY "Allow users to delete own attachments 1rb83je_0" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'message-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow users to view attachments 1rb83je_0') THEN EXECUTE $p$CREATE POLICY "Allow users to view attachments 1rb83je_0" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'message-attachments'::text) AND (auth.role() = 'authenticated'::text)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Anyone can view post-media') THEN EXECUTE $p$CREATE POLICY "Anyone can view post-media" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'post-media'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Authenticated users can upload to post-media') THEN EXECUTE $p$CREATE POLICY "Authenticated users can upload to post-media" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'post-media'::text) AND (auth.uid() IS NOT NULL)))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own post-media') THEN EXECUTE $p$CREATE POLICY "Users can delete own post-media" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update own post-media') THEN EXECUTE $p$CREATE POLICY "Users can update own post-media" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'post-media'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))$p$; END IF; END $m$;

SELECT tests.create_supabase_user('f26b179_member');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;
INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
VALUES (pg_temp.uid('f26b179_member'), 'f26b179_member@f26b179.test.local', 'f26b179_member', 'approved', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (917901, 'F26b school (pgTAP 179)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('f26b179_member'), 'docente', 917901, true);

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('post-media', '17900000-0000-4000-8000-0000000000a1/0.png', NULL),
  ('post-media', '17900000-0000-4000-8000-0000000000a1/1.pdf', NULL),
  ('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-1.pdf', NULL),
  ('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-2.png', NULL),
  ('community-images', 'community-images/f26b179-1.png', NULL);

CREATE OR REPLACE FUNCTION pg_temp.n(b text) RETURNS int LANGUAGE sql AS
  $$ SELECT count(*)::int FROM storage.objects WHERE bucket_id = b AND name LIKE '17900000-%' $$;
GRANT EXECUTE ON FUNCTION pg_temp.n(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A signed-in person lists and reads nothing in either store
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('f26b179_member');
SELECT is(pg_temp.n('post-media'), 0, 'signed-in person lists 0 post-media objects (F26)');
SELECT is(pg_temp.n('message-attachments'), 0, 'signed-in person lists 0 message-attachments objects (F26)');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'post-media'
             AND name = '17900000-0000-4000-8000-0000000000a1/0.png'), 0,
  'signed-in person cannot read a post-media object by its name');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'message-attachments'
             AND name = '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-1.pdf'), 0,
  'signed-in person cannot read a message-attachments object by its name');
SELECT is(public.file_store_allows('post-media', '17900000-0000-4000-8000-0000000000a1/0.png', NULL, 'select', NULL), false,
  'signed-in: post-media select is FALSE');
SELECT is(public.file_store_allows('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-1.pdf', NULL, 'select', NULL), false,
  'signed-in: message-attachments select is FALSE');

-- ---------------------------------------------------------------------------
-- 3. Writes keep being decided by the permissive rules
-- ---------------------------------------------------------------------------
SELECT is(public.file_store_allows('post-media', '17900000-0000-4000-8000-0000000000a2/0.png', NULL, 'insert', NULL), true,
  'signed-in: post-media insert is TRUE (the permissive rules decide)');
SELECT is(public.file_store_allows('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c2/x.pdf', NULL, 'insert', NULL), true,
  'signed-in: message-attachments insert is TRUE (the permissive rules decide)');
SELECT is(public.file_store_allows('post-media', '17900000-0000-4000-8000-0000000000a1/0.png', NULL, 'update', NULL), true,
  'signed-in: post-media update is TRUE (the permissive rules decide)');
SELECT is(public.file_store_allows('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-1.pdf', NULL, 'update', NULL), true,
  'signed-in: message-attachments update is TRUE (the permissive rules decide)');
SELECT is(public.file_store_allows('post-media', '17900000-0000-4000-8000-0000000000a1/0.png', NULL, 'delete', NULL), true,
  'signed-in: post-media delete is TRUE (the permissive rules decide)');
SELECT is(public.file_store_allows('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-1.pdf', NULL, 'delete', NULL), true,
  'signed-in: message-attachments delete is TRUE (the permissive rules decide)');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                  VALUES ('post-media', '17900000-0000-4000-8000-0000000000a2/0.png', auth.uid())$$,
  'signed-in person still uploads a new feed file');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                  VALUES ('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c2/x.pdf', auth.uid())$$,
  'signed-in person still uploads a new attachment');
-- The feed's retry (EC-V7) relies on a second upload of the same name answering "already exists".
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                   VALUES ('post-media', '17900000-0000-4000-8000-0000000000a2/0.png', auth.uid())$$,
  '23505', NULL, 'a second upload of the same feed file name is a duplicate (23505)');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner)
                   VALUES ('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c2/x.pdf', auth.uid())$$,
  '23505', NULL, 'a second upload of the same attachment name is a duplicate (23505)');

-- ---------------------------------------------------------------------------
-- 4. Other stores answer as 126 and 130 assert
-- ---------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'community-images' AND name = 'community-images/f26b179-1.png'), 1,
  'any signed-in person lists community pictures (unchanged)');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'select', NULL), true, 'non-admin: contracts select unchanged');
SELECT is(public.file_store_allows('contracts', 'X_1.pdf', NULL, 'insert', NULL), false, 'non-admin: contracts insert FALSE');
SELECT is(public.file_store_allows('community-documents', 'documents/17900000-0000-4000-8000-0000000000d1/root/x.pdf', NULL, 'select', NULL), false,
  'signed-in: community-documents select is FALSE (unchanged)');
SELECT is(public.file_store_allows('resources', 'images/x.png', NULL, 'select', NULL), false,
  'non-admin: resources lesson images select is FALSE (unchanged)');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- 5. A visitor (anon, no claims) still lists and writes nothing
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT is(pg_temp.n('post-media'), 0, 'visitor lists 0 post-media objects');
SELECT is(pg_temp.n('message-attachments'), 0, 'visitor lists 0 message-attachments objects');
SELECT is(public.file_store_allows('post-media', '17900000-0000-4000-8000-0000000000a1/0.png', NULL, 'select', NULL), false,
  'visitor: post-media select is FALSE');
SELECT is(public.file_store_allows('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c1/f26b179-1.pdf', NULL, 'select', NULL), false,
  'visitor: message-attachments select is FALSE');
SELECT is(public.file_store_allows('post-media', '17900000-0000-4000-8000-0000000000a3/0.png', NULL, 'insert', NULL), false,
  'visitor: post-media insert is FALSE');
SELECT is(public.file_store_allows('message-attachments', '17900000-0000-4000-8000-0000000000b1/17900000-0000-4000-8000-0000000000c3/x.pdf', NULL, 'insert', NULL), false,
  'visitor: message-attachments insert is FALSE');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
