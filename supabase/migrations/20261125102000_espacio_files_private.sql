-- =============================================================================
-- 20261125102000_espacio_files_private.sql — GENERA fixes F26b (EC-F1)
--
-- Espacio Colaborativo's feed files (store `post-media`, paths
-- <post id>/<index>.<ext>) and message attachments (store
-- `message-attachments`, paths <workspace or thread id>/<message id>/<file>)
-- become files that open only through the application. Decided (owner 20 Nov
-- 2026, "Yes, private"): nobody lists or reads these two stores with their own
-- session any more; the routes pages/api/community/post-media/[id].ts and
-- pages/api/community/message-attachments/[id].ts read the post's or the
-- message's row with the caller's session (the table's own read rules decide)
-- and sign the file with the server's client for five minutes.
--
-- Until now public.file_store_allows did not govern these stores (its ELSE
-- answered true), so the older permissive rules let any signed-in person of
-- any community list and read every feed file and every attachment.
--
-- This migration replaces the function with EXACTLY the live body
-- (20261118103000) plus ONE added branch before ELSE: for `post-media` and
-- `message-attachments`, select never; insert, update and delete true (the
-- existing permissive rules keep deciding, and the opening checks still
-- refuse every visitor). No rule on storage.objects and no store is created
-- or altered (the four file_stores_boundary_* rules already call this
-- function; the stores' public flag is switched by hand in Production).
-- Signature, language, STABLE, SECURITY DEFINER, search_path and grants are
-- unchanged; the REVOKE / GRANT lines are repeated so this file stands on
-- its own.
-- =============================================================================

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
    -- F12d: a community's documents, private. Upload by a person who may
    -- enter the workspace named in documents/<workspace uuid>/<...>; nobody
    -- reads a stored file with their own session (send-back 3: files open
    -- only through the application), nobody changes or removes one (a
    -- document the screen removes is a hidden record; the file stays)
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF p_action <> 'insert' THEN
      RETURN false;
    END IF;
    -- send-back 1: a name ending in a slash (an empty last segment) is refused
    IF split_part(v_name, '/', 1) <> 'documents' OR split_part(v_name, '/', 3) = ''
       OR strpos(v_name, '//') > 0 OR v_name ~ '(^|/)[.]{1,2}(/|$)'
       OR right(v_name, 1) = '/' THEN
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

  WHEN 'post-media', 'message-attachments' THEN
    -- Espacio's feed files and message attachments (F26b): nobody lists or
    -- reads them with their own session; they open only through the
    -- application's five-minute links. Uploads, replacements and removals
    -- are left to the existing permissive rules, as before.
    IF p_action = 'select' THEN
      RETURN false;
    END IF;
    RETURN true;

  ELSE
    -- not governed by this phase: unchanged
    RETURN true;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.file_store_allows(text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_store_allows(text, text, uuid, text, uuid) TO anon, authenticated, service_role;
