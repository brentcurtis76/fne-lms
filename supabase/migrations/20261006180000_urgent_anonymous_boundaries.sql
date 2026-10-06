-- FNE-ANON-01: close two anonymous (signed-out) exposures.
--
-- 1. Storage. In Production the `facturas` and `resources` buckets carry
--    permissive DML policies that also apply to the anon role, so anyone holding
--    the public anon key can upload, overwrite, move or delete invoices and
--    course/site assets. No application path writes to either bucket while
--    signed out: every upload/delete is made by a signed-in browser client or by
--    a server route using the service role. Three RESTRICTIVE policies scoped TO
--    anon deny INSERT, UPDATE and DELETE in exactly these two buckets. They AND
--    with whatever permissive policies exist, so they change nothing for
--    authenticated or service_role, nothing for any other bucket, and nothing
--    for reads (public downloads and listing stay as they are). Bucket flags,
--    existing policies and table privileges on storage.objects are untouched.
--
-- 2. Learning records. The baseline GRANT ALL gave anon full read/write on the
--    legacy table lesson_completion_summary (its policy is USING (true)) and on
--    six postgres-owned views that bypass row security (pending_quiz_reviews
--    exposes student names and emails). No signed-out caller uses any of them.
--    All privileges are revoked from anon and PUBLIC; the existing
--    authenticated and service_role grants, view definitions, policies and
--    learning writes are unchanged.
--
-- Additive and atomic: the preflight below refuses to run if the relations or
-- the grants real callers depend on are not as expected, and the postflight
-- refuses to commit unless anon has no remaining privilege. There is no
-- rollback that reopens the exposure; if a legitimate caller breaks, repair
-- that caller (or pause that workflow) and keep these restrictions.

-- Preflight: the seven relations exist with the expected kind, and the signed-in
-- and server callers already hold the grants they use.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('lesson_completion_summary', 'r'),
      ('pending_quiz_reviews', 'v'),
      ('group_assignments_with_status', 'v'),
      ('user_badges_with_details', 'v'),
      ('quiz_statistics', 'v'),
      ('community_progress_report', 'v'),
      ('school_progress_report', 'v')
    ) AS t(relname, relkind)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = r.relname AND c.relkind = r.relkind::"char"
    ) THEN
      RAISE EXCEPTION 'FNE-ANON-01 preflight: public.% (relkind %) not found', r.relname, r.relkind;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', r.relname), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', r.relname), 'SELECT') THEN
      RAISE EXCEPTION 'FNE-ANON-01 preflight: authenticated/service_role lack SELECT on public.%', r.relname;
    END IF;
  END LOOP;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'FNE-ANON-01 preflight: row security is not enabled on storage.objects';
  END IF;
END
$$;

-- 1. Storage: no anonymous writes in facturas or resources.
CREATE POLICY "Anon cannot upload to facturas or resources" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon
  WITH CHECK (bucket_id IS DISTINCT FROM 'facturas' AND bucket_id IS DISTINCT FROM 'resources');
CREATE POLICY "Anon cannot update facturas or resources" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon
  USING (bucket_id IS DISTINCT FROM 'facturas' AND bucket_id IS DISTINCT FROM 'resources')
  WITH CHECK (bucket_id IS DISTINCT FROM 'facturas' AND bucket_id IS DISTINCT FROM 'resources');
CREATE POLICY "Anon cannot delete from facturas or resources" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon
  USING (bucket_id IS DISTINCT FROM 'facturas' AND bucket_id IS DISTINCT FROM 'resources');

-- 2. Learning records: no anonymous access.
REVOKE ALL ON TABLE public.lesson_completion_summary FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pending_quiz_reviews FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.group_assignments_with_status FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.user_badges_with_details FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.quiz_statistics FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.community_progress_report FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.school_progress_report FROM anon, PUBLIC;

-- Postflight: anon holds nothing on the seven relations, signed-in/server
-- SELECT is intact, and the three storage restrictions are in place.
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['lesson_completion_summary', 'pending_quiz_reviews',
    'group_assignments_with_status', 'user_badges_with_details', 'quiz_statistics',
    'community_progress_report', 'school_progress_report']
  LOOP
    -- No ACL entry at all for anon or PUBLIC (grantee 0), i.e. no privilege of any kind.
    IF EXISTS (
      SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
       WHERE c.oid = format('public.%I', rel)::regclass
         AND (a.grantee = 0 OR a.grantee = 'anon'::regrole)
    ) THEN
      RAISE EXCEPTION 'FNE-ANON-01 postflight: anon or PUBLIC still holds a privilege on public.%', rel;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', rel), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', rel), 'SELECT') THEN
      RAISE EXCEPTION 'FNE-ANON-01 postflight: authenticated/service_role lost SELECT on public.%', rel;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'RESTRICTIVE'
         AND roles = ARRAY['anon']::name[]
         AND policyname IN ('Anon cannot upload to facturas or resources',
                            'Anon cannot update facturas or resources',
                            'Anon cannot delete from facturas or resources')) <> 3 THEN
    RAISE EXCEPTION 'FNE-ANON-01 postflight: anon storage restrictions missing';
  END IF;
END
$$;
