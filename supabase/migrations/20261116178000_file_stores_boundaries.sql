-- =============================================================================
-- 20261116178000_file_stores_boundaries.sql — GENERA fixes F2b (GES-1.4, EC-S3, N17)
--
-- The file stores (storage.objects) are written straight from the browser with
-- the signed-in person's own session, so the rules on storage.objects are the
-- only real limit. Production carries permissive rules that this repository
-- does NOT declare (no tracked migration creates the buckets or those rules):
-- with them any signed-in person replaces or deletes invoices, course files,
-- group work and community pictures; a visitor lists every invoice and every
-- course file; anyone with any expense access reads every receipt; a visitor
-- uploads instructor photos.
--
-- This migration closes that with ONE function and FOUR RESTRICTIVE rules
-- (TO public: they bind visitors and signed-in people; the service role
-- bypasses row security and is not affected). Being restrictive, they only
-- narrow what Production's permissive rules give; they give nothing.
-- Public addresses are untouched: every bucket keeps its public flag, so a file
-- whose stored public address a screen shows keeps opening. This closes LISTING
-- and WRITING through the file service.
--
-- The table (admin = public.auth_is_admin(); visitor = auth.uid() IS NULL):
--   all buckets       a visitor never inserts, updates or deletes
--   facturas          select / insert / update / delete: admin only
--   resources         admin: everything. Otherwise, by first folder:
--                       documents/<workspaceId>/…  select, insert: can_access_workspace; update, delete: no
--                       news-images/…              select, insert: active community_manager; update, delete: no
--                       anything else              nothing (visitors: nothing; closes the listing)
--   assignments       select: admin or owner; insert: unchanged; update, delete: admin
--   community-images  select, insert: unchanged; update, delete: admin, or the key
--                     community-images/<workspaceId>-… with can_access_workspace
--   boletas           insert: unchanged; select, delete: admin, owner, or the
--                     receipt of an expense the caller filed; update: admin or owner
--   course-materials, course-assets, instructor-photos, contracts
--                     insert / update / delete: admin; select: unchanged
--   every other bucket unchanged for signed-in people
-- A path without the expected shape gives FALSE for the governed case, never
-- an error.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.file_store_allows(p_bucket text, p_name text, p_owner uuid, p_action text)
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
    RETURN coalesce(public.can_access_workspace(v_uid, v_ws::uuid), false);

  WHEN 'boletas' THEN
    IF p_action = 'insert' THEN
      RETURN true;
    END IF;
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() OR (p_owner IS NOT NULL AND p_owner = v_uid) THEN
      RETURN true;
    END IF;
    IF p_action = 'update' OR v_name = '' THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.expense_items ei
        JOIN public.expense_reports er ON er.id = ei.report_id
       WHERE er.submitted_by = v_uid
         AND (ei.receipt_url = v_name
              OR ei.receipt_url = 'boletas/' || v_name
              OR position('/boletas/' || v_name IN ei.receipt_url) > 0));

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

REVOKE ALL ON FUNCTION public.file_store_allows(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_store_allows(text, text, uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.file_store_allows(text, text, uuid, text) IS
  'F2b (2026-11-16): whether the caller may select/insert/update/delete this storage object. TRUE for buckets and actions F2b does not govern; FALSE (never an error) for a path without the expected shape. Used only by the four RESTRICTIVE file_stores_boundary_* rules on storage.objects.';

CREATE POLICY "file_stores_boundary_select" ON storage.objects
  AS RESTRICTIVE FOR SELECT TO public
  USING (public.file_store_allows(bucket_id, name, owner, 'select'));
CREATE POLICY "file_stores_boundary_insert" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.file_store_allows(bucket_id, name, owner, 'insert'));
CREATE POLICY "file_stores_boundary_update" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (public.file_store_allows(bucket_id, name, owner, 'update'))
  WITH CHECK (public.file_store_allows(bucket_id, name, owner, 'update'));
CREATE POLICY "file_stores_boundary_delete" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO public
  USING (public.file_store_allows(bucket_id, name, owner, 'delete'));
