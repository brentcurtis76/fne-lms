-- =============================================================================
-- 20261118103000_community_documents_private.sql — GENERA fixes F12d (EC-S3)
--
-- A community's documents become private files, opened only through links the
-- application signs for five minutes for a person who may read the document's
-- record. Decided (owner 17 Nov 2026, lead 18 Nov 2026): new uploads go to the
-- private store `community-documents` (same path shape
-- documents/<workspace id>/<folder-<id>|root>/<timestamp>-<name>); each record
-- says where its file is; nothing is moved by this migration (the old files
-- stay in `resources` and are read from there).
--
--   a. the store `community-documents`, only where it is missing (Production
--      already has it: private, empty, no rule); the existing store is never
--      changed
--   b. storage_bucket on community_documents and document_versions: nullable
--      text, no default, only NULL / 'resources' / 'community-documents';
--      empty means the old store `resources`
--   c. public.file_store_allows: its current body (20261117166000), character
--      for character, plus ONE branch `WHEN 'community-documents'`: select and
--      insert for a person who passes public.can_access_workspace for the
--      workspace of documents/<uuid>/...; any other action never; no sign-in
--      never; any other path shape (no workspace, `.`/`..` or empty segments)
--      never
--   d. two permissive rules on storage.objects for the store (select and
--      insert, authenticated), modelled on boletas_filers_*: the store had
--      none, so without them nothing passes; none for any other action. They
--      ask can_access_workspace for the workspace of documents/<uuid>/...
--      themselves (not through file_store_allows, which only the four
--      restrictive file_stores_boundary_* rules call); those restrictive rules
--      (part c) still decide too, with the full path checks.
--   e. public.increment_document_counter: its current body (20260908180300)
--      plus: nothing is counted for a document that is not active
--
-- Additive only: no rule, store, table or row is changed or removed; row
-- level security stays on everywhere. The storage rules of part d come before
-- any trigger (this file creates none).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a. The private store, where it is missing
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('community-documents', 'community-documents', false) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- b. Where each file is
-- -----------------------------------------------------------------------------
-- The CHECK is part of the new column (every existing row holds NULL there, so
-- it cannot fail on Production rows): NULL, 'resources' or 'community-documents'.
ALTER TABLE public.community_documents ADD COLUMN IF NOT EXISTS storage_bucket text
  CONSTRAINT community_documents_storage_bucket_known CHECK (storage_bucket IS NULL OR storage_bucket IN ('resources', 'community-documents'));
ALTER TABLE public.document_versions ADD COLUMN IF NOT EXISTS storage_bucket text
  CONSTRAINT document_versions_storage_bucket_known CHECK (storage_bucket IS NULL OR storage_bucket IN ('resources', 'community-documents'));

COMMENT ON COLUMN public.community_documents.storage_bucket IS
  'The file store that holds this document''s file (storage_path): ''community-documents'' (private; every upload since F12d, 18 Nov 2026) or NULL / ''resources'' (the old public store; documents uploaded before F12d). Read by the link route pages/api/community/documents/[id]/link.ts, which signs a five-minute link.';
COMMENT ON COLUMN public.document_versions.storage_bucket IS
  'The file store that holds this version''s file (storage_path): ''community-documents'' (private; every upload since F12d, 18 Nov 2026) or NULL / ''resources'' (the old public store; versions uploaded before F12d).';

-- -----------------------------------------------------------------------------
-- c. public.file_store_allows: the current body plus the community-documents
--    branch. Signature, language, STABLE, SECURITY DEFINER, search_path and
--    grants unchanged.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.file_store_allows(p_bucket text, p_name text, p_owner uuid, p_action text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_name  text := coalesce(p_name, '');
  v_part  text;
  v_ws    text;
  c_uuid  constant text := '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('select', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;

  -- all buckets: a visitor never writes
  IF v_uid IS NULL AND p_action <> 'select' THEN
    RETURN false;
  END IF;

  -- all buckets: a visitor never lists (N124)
  IF v_uid IS NULL AND p_action = 'select' THEN
    RETURN false;
  END IF;

  CASE p_bucket
  WHEN 'facturas' THEN
    RETURN v_uid IS NOT NULL AND public.auth_is_admin();

  WHEN 'resources' THEN
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    IF p_action NOT IN ('select', 'insert') THEN
      RETURN false;
    END IF;
    v_part := split_part(v_name, '/', 1);
    IF v_part = 'documents' THEN
      v_ws := split_part(v_name, '/', 2);
      IF v_ws !~ c_uuid THEN
        RETURN false;
      END IF;
      RETURN coalesce(public.can_access_workspace(v_uid, v_ws::uuid), false);
    ELSIF v_part = 'news-images' AND strpos(v_name, '/') > 0 THEN
      RETURN EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = v_uid AND ur.role_type = 'community_manager' AND ur.is_active = true);
    END IF;
    RETURN false;

  WHEN 'assignments' THEN
    IF p_action = 'insert' THEN
      RETURN true;
    END IF;
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    RETURN p_action = 'select' AND p_owner IS NOT NULL AND p_owner = v_uid;

  WHEN 'community-images' THEN
    IF p_action IN ('select', 'insert') THEN
      RETURN true;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    v_ws := substring(v_name FROM '^community-images/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})-');
    IF v_ws IS NULL THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.community_workspaces cw
        JOIN public.user_roles ur ON ur.community_id = cw.community_id
       WHERE cw.id = v_ws::uuid
         AND ur.user_id = v_uid
         AND ur.role_type = 'community_manager'
         AND ur.is_active = true);

  WHEN 'boletas' THEN
    -- F7d: the role decides (public.auth_can_file_expenses()), for every
    -- action; the old one-by-one switch grants nothing
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    IF NOT public.auth_can_file_expenses() THEN
      RETURN false;
    END IF;
    IF p_action = 'insert' THEN
      RETURN true;
    END IF;
    IF p_action = 'update' THEN
      -- also a move into boletas: the new row is checked here
      RETURN p_owner IS NOT NULL AND p_owner = v_uid;
    END IF;
    IF p_owner IS NOT NULL THEN
      RETURN p_owner = v_uid;
    END IF;
    IF p_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.expense_receipt_files f
       WHERE f.object_id = p_id
         AND f.user_id = v_uid);

  WHEN 'community-documents' THEN
    -- F12d: a community's documents, private. Read and upload by a person who
    -- may enter the workspace named in documents/<workspace uuid>/<...>;
    -- nobody changes or removes a stored file (a document the screen removes
    -- is a hidden record; the file stays)
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF p_action NOT IN ('select', 'insert') THEN
      RETURN false;
    END IF;
    IF split_part(v_name, '/', 1) <> 'documents' OR split_part(v_name, '/', 3) = ''
       OR strpos(v_name, '//') > 0 OR v_name ~ '(^|/)[.]{1,2}(/|$)' THEN
      RETURN false;
    END IF;
    v_ws := split_part(v_name, '/', 2);
    IF v_ws !~ c_uuid THEN
      RETURN false;
    END IF;
    RETURN coalesce(public.can_access_workspace(v_uid, v_ws::uuid), false);

  WHEN 'course-materials', 'course-assets', 'instructor-photos', 'contracts' THEN
    IF p_action = 'select' THEN
      RETURN true;
    END IF;
    RETURN public.auth_is_admin();

  ELSE
    -- not governed by this phase: unchanged
    RETURN true;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.file_store_allows(text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_store_allows(text, text, uuid, text, uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- d. The store's permissive rules: read and upload, nothing else
-- -----------------------------------------------------------------------------
CREATE POLICY "community_documents_members_select" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (bucket_id = 'community-documents'
         AND split_part(name, '/', 1) = 'documents'
         AND coalesce(public.can_access_workspace(auth.uid(),
               CASE WHEN split_part(name, '/', 2) ~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
                    THEN split_part(name, '/', 2)::uuid END), false));
CREATE POLICY "community_documents_members_insert" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-documents'
         AND split_part(name, '/', 1) = 'documents'
         AND coalesce(public.can_access_workspace(auth.uid(),
               CASE WHEN split_part(name, '/', 2) ~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
                    THEN split_part(name, '/', 2)::uuid END), false));

-- -----------------------------------------------------------------------------
-- e. public.increment_document_counter: the current body plus "only active
--    documents are counted". A hidden document answers as an unknown one:
--    nothing counted, nothing logged, nothing disclosed. The UPDATE itself
--    carries the active condition and the log line follows only a changed
--    row, so a hide committing in between moves nothing (send-back 1). Signature, language,
--    SECURITY DEFINER, search_path and grants unchanged.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_document_counter(document_uuid uuid, counter_type text, user_uuid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  workspace_uuid UUID;
  v_actor uuid := coalesce(user_uuid, auth.uid());
BEGIN
  IF counter_type NOT IN ('view', 'download') THEN
    RAISE EXCEPTION 'Invalid counter type' USING ERRCODE = '22023';
  END IF;

  SELECT workspace_id INTO workspace_uuid
  FROM community_documents
  WHERE id = document_uuid
    AND is_active IS TRUE;  -- F12d: a hidden document is not counted

  IF workspace_uuid IS NULL THEN
    RETURN;  -- unknown or hidden document: nothing to count, nothing disclosed
  END IF;

  PERFORM public.assert_workspace_access(workspace_uuid);
  IF v_actor IS NOT NULL THEN
    PERFORM public.assert_actor_matches(v_actor);
  END IF;

  IF counter_type = 'view' THEN
    UPDATE community_documents
    SET view_count = view_count + 1, updated_at = NOW()
    WHERE id = document_uuid AND is_active IS TRUE;
  ELSE
    UPDATE community_documents
    SET download_count = download_count + 1, updated_at = NOW()
    WHERE id = document_uuid AND is_active IS TRUE;
  END IF;

  -- send-back 1: hidden between the read above and the UPDATE (a hide that
  -- committed meanwhile): no row changed, nothing logged
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_actor IS NOT NULL THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (document_uuid, v_actor, workspace_uuid, counter_type);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_document_counter(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_document_counter(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_document_counter(uuid, text, uuid) TO service_role;
