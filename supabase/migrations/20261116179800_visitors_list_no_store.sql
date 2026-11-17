-- =============================================================================
-- 20261116179800_visitors_list_no_store.sql — GENERA fixes, level 2 (N124)
--
-- 20261116178000_file_stores_boundaries.sql made public.file_store_allows the
-- single gate of four RESTRICTIVE rules on storage.objects. For a visitor
-- (auth.uid() IS NULL) it refused every write, but refused SELECT (listing)
-- only in the stores it governs for reading (facturas, resources, assignments,
-- boletas). A visitor could still LIST course-materials, course-assets,
-- post-media, community-images, feedback-screenshots, instructor-photos and
-- every other store whose older permissive rules let the public role read.
--
-- Decided: a visitor never lists any store. Files in public stores keep
-- opening by their public address (that does not go through these rules).
--
-- This migration replaces the function with EXACTLY the live body plus ONE
-- added rule, right after "a visitor never writes": a visitor never selects,
-- in every bucket. No rule on storage.objects is created or altered (the four
-- file_stores_boundary_* rules already call this function). Signature,
-- language, STABLE, SECURITY DEFINER, search_path and grants are unchanged;
-- the REVOKE / GRANT lines are repeated so this file stands on its own.
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
    IF p_action = 'insert' THEN
      RETURN true;
    END IF;
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    IF p_action = 'update' THEN
      -- also a move into boletas: the new row is checked here
      RETURN p_owner IS NOT NULL AND p_owner = v_uid
         AND EXISTS (SELECT 1 FROM public.expense_report_access a
                      WHERE a.user_id = v_uid AND a.can_submit = true);
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
