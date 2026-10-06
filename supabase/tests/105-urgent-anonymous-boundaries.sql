-- =============================================================================
-- 105-urgent-anonymous-boundaries.sql — FNE-ANON-01: migration
-- 20261006180000_urgent_anonymous_boundaries.sql.
--
-- Signed-out (anon) callers may not write to the `facturas` or `resources`
-- storage buckets, and may not read or write seven learning relations.
-- Everything else is unchanged: signed-in and service-role access, reads and
-- listing of the buckets, other buckets, view definitions and policies.
--
--   1. catalog: the three anon storage restrictions; storage.objects privileges;
--      exact privileges on the seven relations; view options and policies
--   2. learning: anon refused on every relation and every write; signed-in and
--      service role still read (and write the legacy summary)
--   3. storage: anon INSERT/UPDATE/DELETE refused in both buckets (including a
--      move into one), allowed in an unrelated bucket; anon reads unchanged;
--      signed-in and service role writes unchanged; seeded objects intact
--
-- The two buckets and their permissive Production policies exist only in
-- Production; they are modelled here (as in 104) so the restrictions are tested
-- against something that would otherwise let anon in.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(85);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'Anon cannot upload to facturas or resources'
                   AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'INSERT'),
  'restrictive anon INSERT policy on storage.objects');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'Anon cannot update facturas or resources'
                   AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'UPDATE'
                   AND qual IS NOT NULL AND with_check IS NOT NULL),
  'restrictive anon UPDATE policy on storage.objects (USING and WITH CHECK)');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'Anon cannot delete from facturas or resources'
                   AND permissive = 'RESTRICTIVE' AND roles = ARRAY['anon']::name[] AND cmd = 'DELETE'),
  'restrictive anon DELETE policy on storage.objects');

-- storage.objects table privileges are not revoked globally
SELECT ok(has_table_privilege('anon', 'storage.objects', 'SELECT'), 'anon keeps SELECT on storage.objects');
SELECT ok(has_table_privilege('anon', 'storage.objects', 'INSERT'), 'anon keeps INSERT privilege on storage.objects (policy-limited)');
SELECT ok(has_table_privilege('anon', 'storage.objects', 'UPDATE'), 'anon keeps UPDATE privilege on storage.objects (policy-limited)');
SELECT ok(has_table_privilege('anon', 'storage.objects', 'DELETE'), 'anon keeps DELETE privilege on storage.objects (policy-limited)');

CREATE TEMP TABLE rels (relname text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO rels VALUES ('lesson_completion_summary'), ('pending_quiz_reviews'), ('group_assignments_with_status'),
  ('user_badges_with_details'), ('quiz_statistics'), ('community_progress_report'), ('school_progress_report');
GRANT SELECT ON rels TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION pg_temp.privs(role_name text, rel text) RETURNS text AS $$
  SELECT coalesce(string_agg(p, ',' ORDER BY p), '')
    FROM unnest(ARRAY['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) p
   WHERE has_table_privilege(role_name, format('public.%I', rel), p);
$$ LANGUAGE sql;

SELECT is(pg_temp.privs('anon', relname), '', 'anon holds no privilege on public.' || relname)
  FROM rels ORDER BY relname;
SELECT is((SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
            WHERE c.oid = format('public.%I', r.relname)::regclass AND a.grantee = 0), 0,
          'PUBLIC holds no privilege on public.' || r.relname)
  FROM rels r ORDER BY r.relname;
SELECT is(pg_temp.privs('authenticated', relname), 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
          'authenticated privileges unchanged on public.' || relname)
  FROM rels ORDER BY relname;
SELECT is(pg_temp.privs('service_role', relname), 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
          'service_role privileges unchanged on public.' || relname)
  FROM rels ORDER BY relname;

SELECT is((SELECT count(*)::int FROM pg_class c JOIN rels r ON c.oid = format('public.%I', r.relname)::regclass
            WHERE c.relkind = 'v' AND c.reloptions IS NULL AND pg_get_userbyid(c.relowner) = 'postgres'), 6,
  'the six views keep their mode (no options) and owner');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_completion_summary'
                   AND policyname = 'System updates lesson summary' AND roles = ARRAY['public']::name[] AND cmd = 'ALL'),
  'lesson_completion_summary policy unchanged (out of scope)');

-- ---------------------------------------------------------------------------
-- Fixtures (synthetic)
-- ---------------------------------------------------------------------------
SELECT tests.create_supabase_user('fneanon105_docente', 'fneanon105-docente@test.local');
INSERT INTO public.profiles (id, email, name, approval_status)
VALUES (tests.get_supabase_uid('fneanon105_docente'), 'fneanon105-docente@test.local', 'Docente 105', 'approved')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.instructors (id, full_name) VALUES ('f0a10105-0000-4000-8000-000000000001', 'Instructor 105');
INSERT INTO public.courses (id, title, description, instructor_id)
VALUES ('f0a10105-0000-4000-8000-000000000002', 'Curso 105', 'Curso sintetico 105', 'f0a10105-0000-4000-8000-000000000001');
INSERT INTO public.lessons (id, title, course_id)
VALUES ('f0a10105-0000-4000-8000-000000000003', 'Leccion 105', 'f0a10105-0000-4000-8000-000000000002');
INSERT INTO public.lesson_completion_summary (id, user_id, lesson_id, course_id, progress_percentage)
VALUES ('f0a10105-0000-4000-8000-000000000004', tests.get_supabase_uid('fneanon105_docente'),
        'f0a10105-0000-4000-8000-000000000003', 'f0a10105-0000-4000-8000-000000000002', 10);

-- Production-only buckets and permissive policies, modelled (they include anon).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('facturas', 'facturas', true), ('resources', 'resources', true), ('fneanon105-other', 'fneanon105-other', true)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "fneanon105 model facturas" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'facturas') WITH CHECK (bucket_id = 'facturas');
CREATE POLICY "fneanon105 model resources" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'resources') WITH CHECK (bucket_id = 'resources');
CREATE POLICY "fneanon105 model other" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'fneanon105-other') WITH CHECK (bucket_id = 'fneanon105-other');
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('facturas', 'fneanon105/f.pdf'), ('resources', 'fneanon105/r.png'),
  ('fneanon105-other', 'fneanon105/o.txt'), ('fneanon105-other', 'fneanon105/mover.txt');
SELECT set_config('storage.allow_delete_query', 'true', true);

-- ---------------------------------------------------------------------------
-- 2. Learning relations
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT 1 FROM public.%I', relname), '42501', NULL, 'anon cannot read public.' || relname)
  FROM rels ORDER BY relname;
SELECT throws_ok($$INSERT INTO public.lesson_completion_summary (user_id, lesson_id, course_id)
                   VALUES (gen_random_uuid(), 'f0a10105-0000-4000-8000-000000000003', 'f0a10105-0000-4000-8000-000000000002')$$,
  '42501', NULL, 'anon cannot insert into lesson_completion_summary');
SELECT throws_ok($$UPDATE public.lesson_completion_summary SET progress_percentage = 99$$,
  '42501', NULL, 'anon cannot update lesson_completion_summary');
SELECT throws_ok($$DELETE FROM public.lesson_completion_summary$$,
  '42501', NULL, 'anon cannot delete from lesson_completion_summary');
RESET ROLE;

SELECT tests.authenticate_as('fneanon105_docente');
SELECT is((SELECT progress_percentage FROM public.lesson_completion_summary WHERE id = 'f0a10105-0000-4000-8000-000000000004'),
  10.00::numeric, 'signed-in docente still reads lesson_completion_summary');
WITH u AS (UPDATE public.lesson_completion_summary SET progress_percentage = 20
            WHERE id = 'f0a10105-0000-4000-8000-000000000004' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in docente still updates lesson_completion_summary') FROM u;
SELECT lives_ok(format('SELECT count(*) FROM public.%I', relname), 'signed-in user still reads public.' || relname)
  FROM rels WHERE relname <> 'lesson_completion_summary' ORDER BY relname;
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE service_role;
SELECT lives_ok(format('SELECT count(*) FROM public.%I', relname), 'service_role still reads public.' || relname)
  FROM rels ORDER BY relname;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Storage
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('facturas', 'fneanon105/anon.pdf')$$,
  '42501', NULL, 'anon cannot upload to facturas');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('resources', 'fneanon105/anon.png')$$,
  '42501', NULL, 'anon cannot upload to resources');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('fneanon105-other', 'fneanon105/anon.txt')$$,
  'anon can still upload to an unrelated open bucket');
WITH u AS (UPDATE storage.objects SET name = 'fneanon105/renamed.pdf' WHERE bucket_id = 'facturas' AND name = 'fneanon105/f.pdf' RETURNING 1)
SELECT is(count(*)::int, 0, 'anon cannot update/move a facturas object') FROM u;
WITH u AS (UPDATE storage.objects SET name = 'fneanon105/renamed.png' WHERE bucket_id = 'resources' AND name = 'fneanon105/r.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'anon cannot update/move a resources object') FROM u;
WITH u AS (UPDATE storage.objects SET name = 'fneanon105/o2.txt' WHERE bucket_id = 'fneanon105-other' AND name = 'fneanon105/o.txt' RETURNING 1)
SELECT is(count(*)::int, 1, 'anon can still update in an unrelated open bucket') FROM u;
SELECT throws_ok($$UPDATE storage.objects SET bucket_id = 'resources' WHERE bucket_id = 'fneanon105-other' AND name = 'fneanon105/mover.txt'$$,
  '42501', NULL, 'anon cannot move an object into resources');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'facturas' AND name LIKE 'fneanon105/%' RETURNING 1)
SELECT is(count(*)::int, 0, 'anon cannot delete from facturas') FROM d;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'resources' AND name LIKE 'fneanon105/%' RETURNING 1)
SELECT is(count(*)::int, 0, 'anon cannot delete from resources') FROM d;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'fneanon105-other' AND name = 'fneanon105/anon.txt' RETURNING 1)
SELECT is(count(*)::int, 1, 'anon can still delete in an unrelated open bucket') FROM d;
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'facturas' AND name = 'fneanon105/f.pdf'), 1,
  'anon still reads facturas objects');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'resources' AND name = 'fneanon105/r.png'), 1,
  'anon still reads resources objects');
RESET ROLE;

SELECT tests.authenticate_as('fneanon105_docente');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('facturas', 'fneanon105/auth.pdf')$$,
  'signed-in user still uploads to facturas');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('resources', 'fneanon105/auth.png')$$,
  'signed-in user still uploads to resources');
WITH u AS (UPDATE storage.objects SET name = 'fneanon105/auth2.pdf' WHERE bucket_id = 'facturas' AND name = 'fneanon105/auth.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in user still updates in facturas') FROM u;
WITH u AS (UPDATE storage.objects SET name = 'fneanon105/auth2.png' WHERE bucket_id = 'resources' AND name = 'fneanon105/auth.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in user still updates in resources') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'facturas' AND name = 'fneanon105/auth2.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in user still deletes from facturas') FROM d;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'resources' AND name = 'fneanon105/auth2.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'signed-in user still deletes from resources') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE service_role;
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('facturas', 'fneanon105/svc.pdf')$$,
  'service_role still uploads to facturas');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('resources', 'fneanon105/svc.png')$$,
  'service_role still uploads to resources');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'facturas' AND name = 'fneanon105/svc.pdf' RETURNING 1)
SELECT is(count(*)::int, 1, 'service_role still deletes from facturas') FROM d;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'resources' AND name = 'fneanon105/svc.png' RETURNING 1)
SELECT is(count(*)::int, 1, 'service_role still deletes from resources') FROM d;
RESET ROLE;

SELECT is((SELECT count(*)::int FROM storage.objects
            WHERE (bucket_id, name) IN (('facturas', 'fneanon105/f.pdf'), ('resources', 'fneanon105/r.png'))), 2,
  'seeded facturas/resources objects intact after anon attempts');

SELECT * FROM finish();
ROLLBACK;
