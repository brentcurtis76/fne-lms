-- GENERA fixes F12b (17 Nov 2026), EC-D2a: renaming, moving and hiding a
-- document of a community's workspace.
--
-- Owner decision (Brent, 17 Nov 2026): the community's leader or the person
-- who uploaded the document may remove (rename, move) it. Lead's choices the
-- same day: an admin may as well; "removed" means hidden (is_active = false),
-- the record and the stored file stay; the uploader keeps the right only while
-- they still hold an active role in that community; a consultor stays
-- read-only.
--
-- "Leader" is decided over ALL of the caller's active role rows (an EXISTS),
-- never with get_user_workspace_role, which picks one row when a person holds
-- two roles in the same community.
--
-- Add-only: five new functions; N139 narrows the two UPDATE rules (below).

-- ---------------------------------------------------------------------------
-- a. May the caller manage every document of this workspace?
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.can_manage_workspace_documents(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_community_id uuid;
BEGIN
  -- Signed in, and not held by a forced password change.
  IF v_uid IS NULL OR p_workspace_id IS NULL OR NOT public.password_change_gate_ok() THEN
    RETURN false;
  END IF;

  SELECT cw.community_id INTO v_community_id
    FROM public.community_workspaces cw
   WHERE cw.id = p_workspace_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.auth_is_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.community_id = v_community_id
       AND ur.role_type = 'lider_comunidad'
       AND ur.is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_workspace_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace_documents(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_manage_workspace_documents(uuid) IS
  'F12b EC-D2a: TRUE when the signed-in caller (not held by a forced password change) is an admin, or holds an active lider_comunidad role row for the community of the workspace. Unknown workspace: FALSE. Decided over all active role rows, never with get_user_workspace_role.';

-- ---------------------------------------------------------------------------
-- b. May the caller manage this one document?
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.can_manage_community_document(p_document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
  v_uploaded_by uuid;
  v_is_active boolean;
  v_community_id uuid;
BEGIN
  IF v_uid IS NULL OR p_document_id IS NULL OR NOT public.password_change_gate_ok() THEN
    RETURN false;
  END IF;

  SELECT d.workspace_id, d.uploaded_by, d.is_active, cw.community_id
    INTO v_workspace_id, v_uploaded_by, v_is_active, v_community_id
    FROM public.community_documents d
    JOIN public.community_workspaces cw ON cw.id = d.workspace_id
   WHERE d.id = p_document_id;
  IF NOT FOUND OR v_is_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  IF public.can_manage_workspace_documents(v_workspace_id) THEN
    RETURN true;
  END IF;

  RETURN v_uploaded_by = v_uid
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_uid
          AND ur.community_id = v_community_id
          AND ur.is_active = true
     );
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_community_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_community_document(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_manage_community_document(uuid) IS
  'F12b EC-D2a: TRUE when the document exists and is active, and the signed-in caller (not held by a forced password change) either may manage its workspace (can_manage_workspace_documents) or uploaded it and still holds an active role row in the workspace''s community.';

-- ---------------------------------------------------------------------------
-- c. Rename: title only.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.rename_community_document(p_document_id uuid, p_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text := btrim(p_title);
BEGIN
  IF v_uid IS NULL OR NOT public.password_change_gate_ok() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  PERFORM 1 FROM public.community_documents d WHERE d.id = p_document_id FOR UPDATE;

  -- A missing document, a hidden one and one the caller may not manage get
  -- the same answer.
  IF NOT public.can_manage_community_document(p_document_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  IF v_title IS NULL OR length(v_title) < 1 OR length(v_title) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_title';
  END IF;

  UPDATE public.community_documents
     SET title = v_title,
         updated_at = now()
   WHERE id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_community_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_community_document(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rename_community_document(uuid, text) IS
  'F12b EC-D2a: sets the title (trimmed, 1..200 characters, else invalid_title 22023) and updated_at of one active document the caller may manage (can_manage_community_document). A missing, hidden or not-manageable document raises not_allowed (42501). Changes no other column.';

-- ---------------------------------------------------------------------------
-- d. Move: folder only. NULL means "no folder".
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.move_community_document(p_document_id uuid, p_folder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.password_change_gate_ok() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  SELECT d.workspace_id INTO v_workspace_id
    FROM public.community_documents d
   WHERE d.id = p_document_id
     FOR UPDATE;

  IF NOT public.can_manage_community_document(p_document_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  IF p_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.document_folders f
     WHERE f.id = p_folder_id AND f.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_folder';
  END IF;

  UPDATE public.community_documents
     SET folder_id = p_folder_id,
         updated_at = now()
   WHERE id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_community_document(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_community_document(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.move_community_document(uuid, uuid) IS
  'F12b EC-D2a: sets folder_id (NULL = no folder; otherwise a folder of the document''s own workspace, else invalid_folder 22023) and updated_at of one active document the caller may manage (can_manage_community_document). A missing, hidden or not-manageable document raises not_allowed (42501). Changes no other column.';

-- ---------------------------------------------------------------------------
-- e. Hide (the screen's «Eliminar»): is_active = false; nothing is destroyed.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.hide_community_document(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.password_change_gate_ok() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  SELECT d.workspace_id INTO v_workspace_id
    FROM public.community_documents d
   WHERE d.id = p_document_id
     FOR UPDATE;

  IF NOT public.can_manage_community_document(p_document_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  UPDATE public.community_documents
     SET is_active = false,
         updated_at = now()
   WHERE id = p_document_id;

  INSERT INTO public.document_access_log (document_id, user_id, workspace_id, action_type)
  VALUES (p_document_id, v_uid, v_workspace_id, 'delete');
END;
$$;

REVOKE ALL ON FUNCTION public.hide_community_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_community_document(uuid) TO authenticated;

COMMENT ON FUNCTION public.hide_community_document(uuid) IS
  'F12b EC-D2a: hides one active document the caller may manage (can_manage_community_document): sets is_active = false and updated_at, and adds one document_access_log row (document, caller, workspace, the access-log action for a removal). The row and the stored file stay. A missing, already hidden or not-manageable document raises not_allowed (42501).';

-- ---------------------------------------------------------------------------
-- N139: the two UPDATE rules of community_documents let the uploader or a
-- leader change ANY column of the row by a direct request (point it at another
-- stored file, change the uploader, move it to another workspace). Renaming,
-- moving and hiding now go through the functions above, and the view and
-- download counters through increment_document_counter (a definer function),
-- so a direct update is narrowed to admins. Nothing else about the table's
-- rules changes.
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can update their own documents or leaders can update any"
  ON public.community_documents
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER POLICY "Users can delete their own documents or leaders can delete any"
  ON public.community_documents
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());
