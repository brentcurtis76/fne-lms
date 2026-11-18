-- =============================================================================
-- 140-community-documents-private.sql — GENERA fixes F12d (EC-S3): migration
-- 20261118103000_community_documents_private.sql.
--
-- A community's documents become private files. New uploads go to the
-- private store `community-documents` (it already exists in Production:
-- private, empty, no rule). Each record says where its file is
-- (storage_bucket on community_documents and document_versions; empty means
-- the old store `resources`). The counters count only active documents.
--
--   1. catalog: the two columns (nullable text, no default, a comment), the
--      store exists and is private, public.file_store_allows and
--      public.increment_document_counter keep their shape and grants, the one
--      new permissive rule (insert for authenticated) and no rule that lets
--      anyone read, update or delete in the store
--   2. the store, as each person, with real statements on storage.objects:
--      a member of Comunidad A inserts in A's path but does not read it back
--      (send-back 3: nobody reads the store with their own session; files
--      open only through the application's link route); a member of
--      B reads, inserts into A's path, updates, deletes -> refused; the
--      uploader's own update and delete -> refused; a visitor -> nothing; a
--      path without a workspace id, of another shape, with `..` -> refused; an
--      admin inserts, never reads, updates or deletes; a consultor of the
--      school inserts as can_access_workspace answers today (by role school).
--      Send-back 3: the object of a hidden document and of an active one is
--      read by nobody's own session (member, uploader, leader, consultor,
--      admin); no LIST, no copy inside the store
--   3. resources and another store: unchanged (some of 126's assertions again)
--   4. the counters: a hidden document is not counted (view and download, no
--      access-log line); an active one still is; one hidden after it was
--      counted moves no more. Send-back 1: the counter's UPDATE itself
--      carries the active condition and the access-log line is written only
--      when that UPDATE changed a row. A hide committing between the
--      function's read and its UPDATE needs two sessions racing, which one
--      pgTAP session cannot show: the definition is read for that instead.
--
-- Fixtures: the store is created where missing (as in Production); the
-- `resources` store and Production's permissive rules for it, verbatim from
-- the catalogue model (as 126 does); invented people and data only.
-- Blocked INSERT throws 42501; blocked SELECT / UPDATE / DELETE touch 0 rows.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(83);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;

-- WA: workspace of Comunidad A (school 14001); WB: of Comunidad B (school 14002)
CREATE OR REPLACE FUNCTION pg_temp.ws(k text) RETURNS text AS $$
  SELECT CASE k WHEN 'A' THEN 'f12d0000-0000-4000-8000-0000000000a1'
                WHEN 'B' THEN 'f12d0000-0000-4000-8000-0000000000a2' END;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.become(p text) RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
  IF p = 'anon' THEN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  ELSE
    PERFORM tests.authenticate_as('f12d_' || p);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run one data statement as person p: 'rows:<n>' or the SQLSTATE of the refusal.
CREATE OR REPLACE FUNCTION pg_temp.act(p text, stmt text) RETURNS text AS $$
DECLARE r text; n int;
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    r := 'rows:' || n;
  EXCEPTION WHEN others THEN
    r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM tests.clear_authentication();
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- How many objects of that name person p sees (or the SQLSTATE).
CREATE OR REPLACE FUNCTION pg_temp.sees(p text, b text, nm text) RETURNS text AS $$
DECLARE r text;
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE format('SELECT count(*)::text FROM storage.objects WHERE bucket_id = %L AND name = %L', b, nm) INTO r;
  EXCEPTION WHEN others THEN
    r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM tests.clear_authentication();
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- One answer of a question asked as person p (or the SQLSTATE).
CREATE OR REPLACE FUNCTION pg_temp.ask(p text, q text) RETURNS text AS $$
DECLARE r text;
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE q INTO r;
  EXCEPTION WHEN others THEN
    r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM tests.clear_authentication();
  RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.ins(b text, nm text) RETURNS text AS $$
  SELECT format('INSERT INTO storage.objects (bucket_id, name, owner) VALUES (%L, %L, auth.uid())', b, nm);
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.upd(b text, nm text) RETURNS text AS $$
  SELECT format('UPDATE storage.objects SET metadata = ''{"f12d": 1}''::jsonb WHERE bucket_id = %L AND name = %L', b, nm);
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.del(b text, nm text) RETURNS text AS $$
  SELECT format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', b, nm);
$$ LANGUAGE sql;
-- The object exists, read as postgres (unchanged metadata means "not updated").
CREATE OR REPLACE FUNCTION pg_temp.state(b text, nm text) RETURNS text AS $$
  SELECT coalesce((SELECT CASE WHEN metadata ? 'f12d' THEN 'updated' ELSE 'kept' END
                     FROM storage.objects WHERE bucket_id = b AND name = nm), 'gone');
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
-- The store exists in Production (private, empty, no rule); where it is missing
-- locally it is created here exactly as the migration does.
INSERT INTO storage.buckets (id, name, public) VALUES ('community-documents', 'community-documents', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES
  ('resources', 'resources', true), ('f12d140-other', 'f12d140-other', true)
ON CONFLICT (id) DO NOTHING;
-- Production's permissive rules for `resources`, verbatim from the model.
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public deletes from resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public deletes from resources bucket" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public reads from resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public reads from resources bucket" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public updates to resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public updates to resources bucket" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING ((bucket_id = 'resources'::text)) WITH CHECK ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Allow public uploads to resources bucket') THEN EXECUTE $p$CREATE POLICY "Allow public uploads to resources bucket" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((bucket_id = 'resources'::text))$p$; END IF; END $m$;
-- An ungoverned store with an open model rule (as 126 and 105 do).
CREATE POLICY "f12d140 model other" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'f12d140-other') WITH CHECK (bucket_id = 'f12d140-other');

--   memberA   docente of Comunidad A (the uploader of A's file)
--   memberA2  lider_comunidad of Comunidad A
--   memberA3  docente of Comunidad A (another member, not the uploader)
--   memberB   docente of Comunidad B
--   admin     admin
--   consultor consultor whose ROLE names school 14001 (no community)
--   nobody    signed in, no role
INSERT INTO ids SELECT p, tests.create_supabase_user('f12d_' || p, 'f12d-' || p || '@example.test')
FROM unnest(ARRAY['memberA','memberA2','memberA3','memberB','admin','consultor','nobody']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES
  (14001, 'F12D colegio sintético (pgTAP 140)'), (14002, 'F12D otro colegio sintético (pgTAP 140)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('f12d0000-0000-4000-8000-0000000000c1', 14001, 'F12D Comunidad A'),
  ('f12d0000-0000-4000-8000-0000000000c2', 14002, 'F12D Comunidad B');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  (pg_temp.ws('A')::uuid, 'f12d0000-0000-4000-8000-0000000000c1', 'F12D espacio A'),
  (pg_temp.ws('B')::uuid, 'f12d0000-0000-4000-8000-0000000000c2', 'F12D espacio B');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('memberA'),  'docente',         14001, 'f12d0000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('memberA2'), 'lider_comunidad', 14001, 'f12d0000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('memberA3'), 'docente',         14001, 'f12d0000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('memberB'),  'docente',         14002, 'f12d0000-0000-4000-8000-0000000000c2', true),
  (pg_temp.uid('consultor'), 'consultor',      14001, NULL, true),
  (pg_temp.uid('admin'),    'admin',           NULL,  NULL, true);

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('community-documents', 'documents/' || pg_temp.ws('A') || '/root/acta.pdf', pg_temp.uid('memberA')),
  ('community-documents', 'documents/' || pg_temp.ws('B') || '/root/acta-b.pdf', pg_temp.uid('memberB')),
  ('community-documents', 'documents/' || pg_temp.ws('A') || '/root/oculto.pdf', pg_temp.uid('memberA')),
  ('resources', 'documents/' || pg_temp.ws('A') || '/root/antiguo.pdf', pg_temp.uid('memberA')),
  ('resources', 'images/f12d140.png', NULL),
  ('f12d140-other', 'f12d140/o.txt', NULL);
SELECT set_config('storage.allow_delete_query', 'true', true);

CREATE TEMP TABLE k (n text PRIMARY KEY, v text) ON COMMIT DROP;
INSERT INTO k VALUES
  ('a_file',  'documents/' || pg_temp.ws('A') || '/root/acta.pdf'),
  ('b_file',  'documents/' || pg_temp.ws('B') || '/root/acta-b.pdf'),
  ('a_new',   'documents/' || pg_temp.ws('A') || '/root/x.pdf'),
  ('a_old',   'documents/' || pg_temp.ws('A') || '/root/antiguo.pdf'),
  ('a_hidden','documents/' || pg_temp.ws('A') || '/root/oculto.pdf');
CREATE OR REPLACE FUNCTION pg_temp.k(n text) RETURNS text AS $$ SELECT v FROM k WHERE k.n = $1 $$ LANGUAGE sql;
GRANT SELECT ON k TO anon, authenticated;

-- send-back 3: two document records of A whose files are in the store: one
-- active (acta.pdf), one hidden ("deleted" on the screen: oculto.pdf)
INSERT INTO public.community_documents (workspace_id, title, file_name, file_size, mime_type, storage_path, storage_bucket, uploaded_by, is_active) VALUES
  (pg_temp.ws('A')::uuid, 'Acta sintética activa', 'acta.pdf', 10, 'application/pdf', pg_temp.k('a_file'), 'community-documents', pg_temp.uid('memberA'), true),
  (pg_temp.ws('A')::uuid, 'Acta sintética oculta', 'oculto.pdf', 10, 'application/pdf', pg_temp.k('a_hidden'), 'community-documents', pg_temp.uid('memberA'), false);

-- ---------------------------------------------------------------------------
-- 1. Catalog (17)
-- ---------------------------------------------------------------------------
SELECT is((SELECT format_type(a.atttypid, a.atttypmod) || ':' || (NOT a.attnotnull)::text || ':' || a.atthasdef::text
             FROM pg_attribute a WHERE a.attrelid = 'public.community_documents'::regclass AND a.attname = 'storage_bucket' AND NOT a.attisdropped),
  'text:true:false', 'community_documents.storage_bucket: text, nullable, no default');
SELECT is((SELECT format_type(a.atttypid, a.atttypmod) || ':' || (NOT a.attnotnull)::text || ':' || a.atthasdef::text
             FROM pg_attribute a WHERE a.attrelid = 'public.document_versions'::regclass AND a.attname = 'storage_bucket' AND NOT a.attisdropped),
  'text:true:false', 'document_versions.storage_bucket: text, nullable, no default');
SELECT ok(col_description('public.community_documents'::regclass,
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.community_documents'::regclass AND attname = 'storage_bucket')) IS NOT NULL,
  'community_documents.storage_bucket has a comment');
SELECT ok(col_description('public.document_versions'::regclass,
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.document_versions'::regclass AND attname = 'storage_bucket')) IS NOT NULL,
  'document_versions.storage_bucket has a comment');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'community-documents'), false, 'the store community-documents exists and is private');
SELECT throws_ok(format($q$INSERT INTO public.community_documents (workspace_id, title, file_name, file_size, mime_type, storage_path, storage_bucket, uploaded_by)
                          VALUES (%L, 'x', 'x.pdf', 1, 'application/pdf', 'documents/x/root/x.pdf', 'otro-almacen', %L)$q$, pg_temp.ws('A'), pg_temp.uid('memberA')),
  '23514', NULL, 'storage_bucket accepts only NULL, resources or community-documents');
SELECT ok((SELECT prosecdef AND provolatile = 's' AND proconfig = ARRAY['search_path=public, pg_temp']
             FROM pg_proc WHERE oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure),
  'file_store_allows is still STABLE, SECURITY DEFINER, search_path pinned');
SELECT ok(has_function_privilege('anon', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.file_store_allows(text, text, uuid, text, uuid)', 'EXECUTE')
          AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                           WHERE p.oid = 'public.file_store_allows(text, text, uuid, text, uuid)'::regprocedure AND a.grantee = 0),
  'file_store_allows grants unchanged (anon, authenticated; not PUBLIC)');
SELECT ok((SELECT prosecdef AND proconfig = ARRAY['search_path=public, pg_temp']
             FROM pg_proc WHERE oid = 'public.increment_document_counter(uuid, text, uuid)'::regprocedure),
  'increment_document_counter is still SECURITY DEFINER, search_path pinned');
SELECT ok(has_function_privilege('authenticated', 'public.increment_document_counter(uuid, text, uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.increment_document_counter(uuid, text, uuid)', 'EXECUTE'),
  'increment_document_counter: authenticated executes, anon does not (unchanged)');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-documents%'), 0,
  'send-back 3: no permissive rule lets anyone read community-documents with their own session');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'community_documents_members_insert' AND permissive = 'PERMISSIVE'
                   AND roles = ARRAY['authenticated']::name[] AND cmd = 'INSERT' AND with_check LIKE '%community-documents%'),
  'community_documents_members_insert: PERMISSIVE, TO authenticated, FOR INSERT, on the store');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND permissive = 'PERMISSIVE' AND cmd IN ('UPDATE', 'DELETE', 'ALL')
             AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%community-documents%'), 0,
  'no permissive rule lets anyone update or delete in community-documents');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'file_stores_boundary_select' AND permissive = 'RESTRICTIVE'),
  'the restrictive file_stores_boundary_select rule is still there');
SELECT is(public.file_store_allows('community-documents', 'documents/' || pg_temp.ws('A') || '/root/x.pdf', NULL, 'select', NULL), false,
  'no sign-in: the store answers FALSE for select');
SELECT is(public.file_store_allows('community-documents', 'documents/' || pg_temp.ws('A') || '/root/x.pdf', NULL, 'insert', NULL), false,
  'no sign-in: the store answers FALSE for insert');
SELECT is(public.file_store_allows('community-documents', 'documents/' || pg_temp.ws('A') || '/root/x.pdf', NULL, 'bogus', NULL), false,
  'unknown action: FALSE');

-- ---------------------------------------------------------------------------
-- 2. The store as each person (46)
-- ---------------------------------------------------------------------------
-- member of A
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', pg_temp.k('a_new'))), 'rows:1',
  'a member of Comunidad A uploads documents/<A>/root/x.pdf into community-documents');
SELECT is(pg_temp.sees('memberA', 'community-documents', pg_temp.k('a_new')), '0', 'send-back 3: the uploader does not read it back with their own session');
SELECT is(pg_temp.sees('memberA', 'community-documents', pg_temp.k('a_file')), '0', 'send-back 3: the member does not read A''s existing file with their own session');
SELECT is(pg_temp.sees('memberA2', 'community-documents', pg_temp.k('a_file')), '0', 'send-back 3: the community''s leader does not read A''s file with their own session');
SELECT is(pg_temp.sees('memberA', 'community-documents', pg_temp.k('b_file')), '0', 'a member of A does not read B''s file');
-- the uploader's own file: no update, no delete
SELECT is(pg_temp.act('memberA', pg_temp.upd('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'the uploader cannot update their own stored file');
SELECT is(pg_temp.act('memberA', pg_temp.del('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'the uploader cannot delete their own stored file');
SELECT is(pg_temp.act('memberA', pg_temp.del('community-documents', pg_temp.k('a_new'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_new')),
  'rows:0|kept', 'the uploader cannot delete the file they have just uploaded');
SELECT is(pg_temp.act('memberA2', pg_temp.del('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'the community''s leader cannot delete a stored file either');
-- paths
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/root/x.pdf')), '42501',
  'a path without a workspace id is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/no-es-uuid/root/x.pdf')), '42501',
  'a path whose workspace part is not a uuid is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'uploads/' || pg_temp.ws('A') || '/root/x.pdf')), '42501',
  'a path of another shape (not documents/) is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A'))), '42501',
  'the bare workspace folder (no file) is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/../' || pg_temp.ws('B') || '/x.pdf')), '42501',
  'a path with .. is refused even when it starts in the member''s workspace');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/../x.pdf')), '42501',
  'a path with .. further down is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '//x.pdf')), '42501',
  'a path with an empty segment is refused');
-- send-back 1: a name whose last segment is empty (ends in a slash)
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/')), '42501',
  'a name ending in a slash after the folder (documents/<ws>/root/) is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/')), '42501',
  'a name ending in a slash after the workspace (documents/<ws>/) is refused');
SELECT is(pg_temp.act('memberA', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/x.pdf/')), '42501',
  'a name ending in a slash after a file-like segment is refused');
SELECT is(public.file_store_allows('community-documents', 'documents/' || pg_temp.ws('A') || '/./x.pdf', pg_temp.uid('memberA'), 'insert', NULL), false,
  'a path with a . segment gives FALSE');
-- member of B
SELECT is(pg_temp.sees('memberB', 'community-documents', pg_temp.k('a_file')), '0', 'a member of B does not read A''s file');
SELECT is(pg_temp.act('memberB', 'SELECT 1 FROM storage.objects WHERE bucket_id = ''community-documents'' AND name LIKE ''documents/' || pg_temp.ws('A') || '/%'''), 'rows:0',
  'a member of B lists nothing of A''s folder');
SELECT is(pg_temp.act('memberB', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/b-en-a.pdf')), '42501',
  'a member of B cannot upload into A''s path');
SELECT is(pg_temp.act('memberB', pg_temp.upd('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'a member of B cannot update A''s file');
SELECT is(pg_temp.act('memberB', pg_temp.del('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'a member of B cannot delete A''s file');
SELECT is(pg_temp.act('memberB', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('B') || '/root/propio.pdf')), 'rows:1',
  'a member of B uploads into B''s own path');
SELECT is(pg_temp.act('memberB', pg_temp.upd('community-documents', pg_temp.k('b_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('b_file')),
  'rows:0|kept', 'a member of B cannot update B''s own stored file');
-- a signed-in person with no role
SELECT is(pg_temp.sees('nobody', 'community-documents', pg_temp.k('a_file')), '0', 'a signed-in person with no role reads nothing');
SELECT is(pg_temp.act('nobody', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/n.pdf')), '42501',
  'a signed-in person with no role cannot upload');
-- visitor
SELECT is(pg_temp.sees('anon', 'community-documents', pg_temp.k('a_file')), '0', 'a visitor reads nothing in the store');
SELECT is(pg_temp.act('anon', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/v.pdf')), '42501',
  'a visitor cannot upload');
SELECT is(pg_temp.act('anon', pg_temp.upd('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'a visitor cannot update');
SELECT is(pg_temp.act('anon', pg_temp.del('community-documents', pg_temp.k('a_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_file')),
  'rows:0|kept', 'a visitor cannot delete');
-- admin
SELECT is(pg_temp.sees('admin', 'community-documents', pg_temp.k('b_file')), '0', 'send-back 3: an admin does not read a community''s file with their own session');
SELECT is(pg_temp.act('admin', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('B') || '/root/admin.pdf')), 'rows:1',
  'an admin uploads into a community''s path');
SELECT is(pg_temp.act('admin', pg_temp.upd('community-documents', pg_temp.k('b_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('b_file')),
  'rows:0|kept', 'an admin does not update a stored file either');
SELECT is(pg_temp.act('admin', pg_temp.del('community-documents', pg_temp.k('b_file'))) || '|' || pg_temp.state('community-documents', pg_temp.k('b_file')),
  'rows:0|kept', 'an admin does not delete a stored file either');
-- consultor whose role names school 14001: can_access_workspace says yes for A, no for B (pinned as it is today)
SELECT is(pg_temp.ask('consultor', format('SELECT public.can_access_workspace(auth.uid(), %L)::text', pg_temp.ws('A'))) || '|'
          || pg_temp.ask('consultor', format('SELECT public.can_access_workspace(auth.uid(), %L)::text', pg_temp.ws('B'))),
  'true|false', 'pin: can_access_workspace (asked as the consultor) answers true for their role school, false for another school');
SELECT is(pg_temp.sees('consultor', 'community-documents', pg_temp.k('a_file')) || '|'
          || pg_temp.act('consultor', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('A') || '/root/c.pdf')),
  '0|rows:1', 'a consultor of A''s school uploads in A''s path (as can_access_workspace answers) but does not read it with their own session (send-back 3)');
SELECT is(pg_temp.sees('consultor', 'community-documents', pg_temp.k('b_file')) || '|'
          || pg_temp.act('consultor', pg_temp.ins('community-documents', 'documents/' || pg_temp.ws('B') || '/root/c.pdf')),
  '0|42501', 'the consultor reads and uploads nothing in B''s path (another school)');

-- send-back 3: a hidden document's object and an active one's are read by
-- nobody's own session (the tester's finding: LIST, GET, sign and copy all
-- start with a SELECT on storage.objects)
SELECT is(pg_temp.sees('memberA', 'community-documents', pg_temp.k('a_hidden')) || '|' || pg_temp.sees('memberA', 'community-documents', pg_temp.k('a_file')),
  '0|0', 'send-back 3: the uploader reads neither the hidden document''s object nor the active one''s');
SELECT is(pg_temp.sees('memberA3', 'community-documents', pg_temp.k('a_hidden')) || '|' || pg_temp.sees('memberA3', 'community-documents', pg_temp.k('a_file')),
  '0|0', 'send-back 3: another member of the community reads neither');
SELECT is(pg_temp.sees('memberA2', 'community-documents', pg_temp.k('a_hidden')) || '|' || pg_temp.sees('memberA2', 'community-documents', pg_temp.k('a_file')),
  '0|0', 'send-back 3: the community''s leader reads neither');
SELECT is(pg_temp.sees('consultor', 'community-documents', pg_temp.k('a_hidden')) || '|' || pg_temp.sees('consultor', 'community-documents', pg_temp.k('a_file')),
  '0|0', 'send-back 3: the consultor of the school reads neither');
SELECT is(pg_temp.sees('admin', 'community-documents', pg_temp.k('a_hidden')) || '|' || pg_temp.sees('admin', 'community-documents', pg_temp.k('a_file')),
  '0|0', 'send-back 3: the admin reads neither');
SELECT is(pg_temp.act('memberA3', 'SELECT name FROM storage.objects WHERE bucket_id = ''community-documents'' AND name LIKE ''documents/' || pg_temp.ws('A') || '/%'''), 'rows:0',
  'send-back 3: a member lists nothing of their own community''s folder');
SELECT is(pg_temp.act('memberA', format('INSERT INTO storage.objects (bucket_id, name, owner) SELECT bucket_id, name || %L, auth.uid() FROM storage.objects WHERE bucket_id = %L AND name = %L',
                                        '.copia', 'community-documents', pg_temp.k('a_hidden'))) || '|' || pg_temp.state('community-documents', pg_temp.k('a_hidden') || '.copia'),
  'rows:0|gone', 'send-back 3: the uploader cannot copy the hidden document''s object inside the store');
SELECT is(pg_temp.ask('memberA', format('SELECT public.file_store_allows(%L, %L, NULL, %L, NULL)::text', 'community-documents', pg_temp.k('a_file'), 'select')), 'false',
  'send-back 3: file_store_allows answers FALSE for select on the store, even for a member of the path''s workspace');
SELECT is(pg_temp.ask('memberA', format('SELECT public.file_store_allows(%L, %L, NULL, %L, NULL)::text', 'community-documents', pg_temp.k('a_new'), 'insert')), 'true',
  'send-back 3: file_store_allows still answers TRUE for insert by a member of the path''s workspace');

-- ---------------------------------------------------------------------------
-- 3. resources and an ungoverned store: unchanged (7)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.sees('memberA', 'resources', pg_temp.k('a_old')), '1', 'resources: a member still lists their workspace''s old document');
SELECT is(pg_temp.sees('memberB', 'resources', pg_temp.k('a_old')), '0', 'resources: a member of another community still does not');
SELECT is(pg_temp.act('memberA', pg_temp.ins('resources', 'documents/' || pg_temp.ws('A') || '/root/nuevo.pdf')), 'rows:1',
  'resources: a member can still upload a document to their workspace (unchanged)');
SELECT is(pg_temp.act('memberA', pg_temp.del('resources', pg_temp.k('a_old'))) || '|' || pg_temp.state('resources', pg_temp.k('a_old')),
  'rows:0|kept', 'resources: a member still cannot delete a document');
SELECT is(pg_temp.sees('memberA', 'resources', 'images/f12d140.png'), '0', 'resources: a non-admin still cannot list lesson images');
SELECT is(pg_temp.sees('admin', 'resources', 'images/f12d140.png'), '1', 'resources: the admin still lists lesson images');
SELECT is(pg_temp.sees('memberA', 'f12d140-other', 'f12d140/o.txt'), '1', 'an ungoverned store is still not governed for a signed-in person');

-- ---------------------------------------------------------------------------
-- 4. The counters count only active documents (6)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE docs (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON docs TO anon, authenticated;
WITH made AS (
  INSERT INTO public.community_documents (workspace_id, title, file_name, file_size, mime_type, storage_path, uploaded_by, is_active)
  SELECT pg_temp.ws('A')::uuid, 'Acta sintética ' || v.k, v.k || '.pdf', 10, 'application/pdf',
         'documents/' || pg_temp.ws('A') || '/root/' || v.k || '.pdf', pg_temp.uid('memberA'), v.act
    FROM (VALUES ('f12d-active', true), ('f12d-hidden', false)) v(k, act)
  RETURNING id, file_name)
INSERT INTO docs SELECT replace(replace(file_name, 'f12d-', ''), '.pdf', ''), id FROM made;
CREATE OR REPLACE FUNCTION pg_temp.doc(k text) RETURNS uuid AS $$ SELECT id FROM docs WHERE docs.k = $1 $$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.counts(d uuid) RETURNS text AS $$
  SELECT cd.view_count || '/' || cd.download_count || '/' ||
         CASE WHEN EXISTS (SELECT 1 FROM public.document_access_log l WHERE l.document_id = d AND l.action_type IN ('view', 'download'))
              THEN 'logged' ELSE 'no log' END
    FROM public.community_documents cd WHERE cd.id = d;
$$ LANGUAGE sql;

SELECT is(pg_temp.act('memberA', format('SELECT public.increment_document_counter(%L, ''view'', NULL)', pg_temp.doc('hidden'))), 'rows:1',
  'counting a view of a hidden document does not fail (nothing disclosed)');
SELECT is(pg_temp.act('memberA', format('SELECT public.increment_document_counter(%L, ''download'', NULL)', pg_temp.doc('hidden'))), 'rows:1',
  'counting a download of a hidden document does not fail');
SELECT is(pg_temp.counts(pg_temp.doc('hidden')), '0/0/no log',
  'a hidden document is not counted: views 0, downloads 0, no access-log line');
SELECT is(pg_temp.act('memberA', format('SELECT public.increment_document_counter(%L, ''view'', NULL)', pg_temp.doc('active')))
          || '|' || pg_temp.act('memberA', format('SELECT public.increment_document_counter(%L, ''download'', NULL)', pg_temp.doc('active'))),
  'rows:1|rows:1', 'counting an active document works');
SELECT is(pg_temp.counts(pg_temp.doc('active')), '1/1/logged', 'an active document is still counted: one view, one download, logged');
SELECT is(pg_temp.act('memberA', format('SELECT public.increment_document_counter(%L, ''bogus'', NULL)', pg_temp.doc('hidden'))), '22023',
  'an invalid counter type is still refused first, even for a hidden document');

-- send-back 1: hidden after it was counted -> nothing moves any more
UPDATE public.community_documents SET is_active = false WHERE id = pg_temp.doc('active');
CREATE TEMP TABLE log_before ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.document_access_log WHERE document_id = pg_temp.doc('active');
SELECT is(pg_temp.act('memberA', format('SELECT public.increment_document_counter(%L, ''view'', NULL)', pg_temp.doc('active'))), 'rows:1',
  'counting a document hidden after it was counted does not fail');
SELECT is(pg_temp.counts(pg_temp.doc('active')) || '|' ||
          ((SELECT count(*) FROM public.document_access_log WHERE document_id = pg_temp.doc('active')) - (SELECT n FROM log_before))::text,
  '1/1/logged|0', 'a document hidden after it was counted: counters unchanged, no new access-log line');
-- send-back 1: the definition (a race of two sessions cannot be run here)
CREATE TEMP TABLE counter_def ON COMMIT DROP AS
  SELECT regexp_replace(regexp_replace(pg_get_functiondef('public.increment_document_counter(uuid, text, uuid)'::regprocedure),
                        '--[^\n]*', '', 'g'), '\s+', ' ', 'g') AS d;  -- comments out, spaces folded
SELECT is((SELECT count(*)::int FROM counter_def,
             regexp_matches(d, 'UPDATE community_documents SET (view|download)_count = \1_count \+ 1, updated_at = NOW\(\) WHERE id = document_uuid AND is_active IS TRUE;', 'g')),
  2, 'both counter UPDATEs carry the active condition themselves');
SELECT ok((SELECT position('END IF; IF NOT FOUND THEN RETURN; END IF; IF v_actor IS NOT NULL THEN INSERT INTO document_access_log' IN d) > 0 FROM counter_def),
  'the access-log line is written only when the UPDATE changed a row');

SELECT * FROM finish();
ROLLBACK;
