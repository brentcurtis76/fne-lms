-- =============================================================================
-- 20260907120400_c1_function_exposure.sql — RLS closure C1: the 21 remaining
-- D-RLS function-exposure dispositions (remaining-work audit 2026-09-07 §1).
--
-- Depends on: 20260907120200 (auth_is_backend_caller, created there) and
-- 20260907120300 (auth_is_backend_caller TIGHTENED there: a service_role JWT
-- claim, or a direct database session with no request claims and no
-- application role active; absence of identity alone is never backend
-- authority). Everything else referenced here is committed schema
-- (user_roles, superadmins, dev_users, feedback_permissions, community_*,
-- meeting_attendees, transformation_assessment_collaborators,
-- group_assignment_members, red_escuelas, role_permission*, assignment_
-- templates, modules, lessons). Additive: CREATE OR REPLACE with identical
-- signatures (parameter names and return types unchanged), REVOKE/GRANT and
-- search_path pins only; no table, column or policy is dropped or altered.
--
-- Prefix compatibility: at P4 (the four earlier candidate migrations) these
-- functions keep their pre-existing bodies and grants; this migration only
-- narrows what a caller-supplied identifier can reveal and which application
-- roles can execute unused endpoints. Every policy that references one of the
-- actor-bound predicates passes auth.uid() (policy inventory captured in
-- supabase/tests/077-c1-function-exposure.sql), so policy evaluation is
-- unchanged for the calling user; anon evaluation of the public-targeted
-- policies returns FALSE instead of raising (the anon EXECUTE grant is kept
-- exactly where a policy can be evaluated by anon).
--
-- Binding rule (shared helper auth_actor_bound): a caller-supplied user id is
-- honoured only when it IS the authenticated user, or the caller is a literal
-- admin (auth_is_admin()), or there is no end-user identity and the caller is
-- a trusted backend principal (auth_is_backend_caller()). Otherwise the
-- predicate answers its safe negative (FALSE / NULL / empty array) — it never
-- raises inside a policy. current_user is never consulted.
--
-- Dispositions (audit table, 21 rows):
--   actor-bound predicates, grants kept for policy evaluation (12):
--     can_access_workspace, can_edit_meeting, fn_is_events_manager,
--     get_user_workspace_role, has_feedback_permission, is_admin_or_consultor,
--     is_assessment_collaborator, is_dev_user, is_global_admin,
--     supervisor_can_access_user, user_is_in_group, user_school_ids
--   backend-only (service_role EXECUTE; no application caller exists) (7):
--     get_available_assignment_templates (ORDER BY fixed: modules.order_number,
--     lessons.order_number — m.order_index never existed), get_baseline_
--     permissions, get_effective_permissions, get_effective_user_role,
--     get_user_admin_status, get_user_messaging_permissions, is_community_member
--   service-only superadmin check (1): auth_is_superadmin (all five callers are
--     service-role admin routes; body additionally actor-bound)
--   admin-gated browser endpoint (1): get_school_user_counts (authenticated
--     EXECUTE kept for pages/admin/schools.tsx; body requires literal admin or
--     backend; 42501 otherwise)
--   already fixed, unchanged here (1): has_global_workspace_access (120200)
--
-- Semantics deliberately PRESERVED (recorded, not redesigned):
--   can_edit_meeting keeps its global admin/consultor short-circuit;
--   is_admin_or_consultor keeps equipo_directivo and COALESCE(is_active, true);
--   supervisor_can_access_user keeps LIMIT 1 role/school resolution and its
--   network check; get_user_messaging_permissions still ignores p_workspace_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Shared binding helper (internal: no EXECUTE for any application role).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_actor_bound(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF v_actor IS NOT NULL THEN
    IF p_user_id = v_actor THEN
      RETURN true;
    END IF;
    RETURN public.auth_is_admin();
  END IF;
  RETURN public.auth_is_backend_caller();
END;
$$;
REVOKE ALL ON FUNCTION public.auth_actor_bound(uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_actor_bound(uuid) IS
  'C1 (2026-09-07): TRUE when a caller-supplied user id may be answered about — it is the authenticated user, or the caller is a literal admin, or (no end-user identity) the caller is a trusted backend principal. NULL → FALSE. Internal; used by the actor-bound policy predicates.';

-- -----------------------------------------------------------------------------
-- 1. Actor-bound policy predicates (grants: anon + authenticated + service_role,
--    PUBLIC revoked; bodies bound; search_path pinned; STABLE).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_workspace(p_user_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_workspace_id IS NULL OR NOT public.auth_actor_bound(p_user_id) THEN
    RETURN false;
  END IF;

  -- admin (global)
  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user_id AND role_type = 'admin' AND is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- member of the community that owns the workspace
  IF EXISTS (
    SELECT 1
      FROM public.community_workspaces cw
      JOIN public.user_roles ur ON ur.community_id = cw.community_id
     WHERE cw.id = p_workspace_id AND ur.user_id = p_user_id AND ur.is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- consultor of the school that owns the community
  IF EXISTS (
    SELECT 1
      FROM public.community_workspaces cw
      JOIN public.growth_communities gc ON gc.id = cw.community_id
      JOIN public.user_roles ur ON ur.school_id = gc.school_id
     WHERE cw.id = p_workspace_id AND ur.user_id = p_user_id
       AND ur.role_type = 'consultor' AND ur.is_active = true
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_workspace(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_workspace(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_edit_meeting(check_user_id uuid, check_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF check_meeting_id IS NULL OR NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;

  -- Existing semantics preserved: global admin / consultor short-circuit.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = check_user_id AND role_type IN ('admin','consultor') AND is_active = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.community_meetings cm
      JOIN public.community_workspaces cw ON cw.id = cm.workspace_id
     WHERE cm.id = check_meeting_id
       AND (
         cm.created_by = check_user_id
         OR cm.facilitator_id = check_user_id
         OR cm.secretary_id = check_user_id
         OR EXISTS (
           SELECT 1 FROM public.meeting_attendees ma
            WHERE ma.meeting_id = cm.id AND ma.user_id = check_user_id AND ma.role = 'co_editor'
         )
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = check_user_id AND ur.community_id = cw.community_id
              AND ur.role_type = 'lider_comunidad' AND ur.is_active = true
         )
       )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_edit_meeting(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_meeting(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_is_events_manager(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_actor_bound(p_user_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = p_user_id AND ur.is_active = true
       AND ur.role_type IN ('admin','community_manager')
  ) THEN
    RETURN true;
  END IF;
  -- superadmins is committed schema (public.superadmins); the former
  -- information_schema existence probe is no longer needed.
  RETURN EXISTS (
    SELECT 1 FROM public.superadmins sa
     WHERE sa.user_id = p_user_id AND sa.is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fn_is_events_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_events_manager(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_workspace_role(p_user_id uuid, p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_workspace_id IS NULL OR NOT public.auth_actor_bound(p_user_id) THEN
    RETURN NULL;
  END IF;

  SELECT role_type INTO v_role
    FROM public.user_roles
   WHERE user_id = p_user_id AND role_type = 'admin' AND is_active = true
   LIMIT 1;
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  SELECT ur.role_type INTO v_role
    FROM public.user_roles ur
    JOIN public.community_workspaces cw ON cw.community_id = ur.community_id
   WHERE ur.user_id = p_user_id AND cw.id = p_workspace_id AND ur.is_active = true
   LIMIT 1;
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  SELECT ur.role_type INTO v_role
    FROM public.user_roles ur
    JOIN public.community_workspaces cw ON cw.id = p_workspace_id
    JOIN public.growth_communities gc ON gc.id = cw.community_id
   WHERE ur.user_id = p_user_id AND ur.role_type = 'consultor'
     AND ur.school_id = gc.school_id AND ur.is_active = true
   LIMIT 1;

  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_workspace_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_role(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_feedback_permission(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = check_user_id AND role_type = 'admin' AND is_active = true
  ) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.feedback_permissions
     WHERE user_id = check_user_id AND is_active = true AND revoked_at IS NULL
  );
END;
$$;
REVOKE ALL ON FUNCTION public.has_feedback_permission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_feedback_permission(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_or_consultor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Existing semantics preserved: equipo_directivo included; NULL is_active
  -- treated as active (COALESCE). Only the actor binding is new.
  SELECT public.auth_actor_bound(p_uid)
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_uid
          AND COALESCE(ur.is_active, true)
          AND ur.role_type IN ('admin','consultor','equipo_directivo')
     );
$$;
REVOKE ALL ON FUNCTION public.is_admin_or_consultor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_consultor(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_assessment_collaborator(assessment_uuid uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- The USER argument is bound to the actor; the assessment identifier is the
  -- object being asked about and stays free.
  SELECT public.auth_actor_bound(uid)
     AND EXISTS (
       SELECT 1 FROM public.transformation_assessment_collaborators
        WHERE assessment_id = assessment_uuid AND user_id = uid AND can_edit = true
     );
$$;
REVOKE ALL ON FUNCTION public.is_assessment_collaborator(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assessment_collaborator(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_dev_user(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Nested callers (get_effective_user_role, start_dev_impersonation) are
  -- service_role-only and reach this with no end-user identity → backend
  -- path; the dev policies pass auth.uid() → self path.
  IF NOT public.auth_actor_bound(user_uuid) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.dev_users WHERE user_id = user_uuid AND is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_dev_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dev_user(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_global_admin(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_actor_bound(user_uuid) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = user_uuid AND role_type = 'admin' AND is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_global_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_admin(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisor_can_access_user(supervisor_user_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  supervisor_network_id uuid;
  target_school_id integer;
  school_in_network boolean;
BEGIN
  -- The SUPERVISOR is bound to the actor; the target stays a free argument
  -- (the question is "may I, the supervisor, see this user?").
  IF target_user_id IS NULL OR NOT public.auth_actor_bound(supervisor_user_id) THEN
    RETURN false;
  END IF;

  SELECT red_id INTO supervisor_network_id
    FROM public.user_roles
   WHERE user_id = supervisor_user_id AND role_type = 'supervisor_de_red'
     AND is_active = true AND red_id IS NOT NULL
   LIMIT 1;
  IF supervisor_network_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT school_id INTO target_school_id
    FROM public.user_roles
   WHERE user_id = target_user_id AND is_active = true AND school_id IS NOT NULL
   LIMIT 1;
  IF target_school_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.red_escuelas
     WHERE red_id = supervisor_network_id AND school_id = target_school_id
  ) INTO school_in_network;

  RETURN school_in_network;
END;
$$;
REVOKE ALL ON FUNCTION public.supervisor_can_access_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisor_can_access_user(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_is_in_group(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_group_id IS NULL OR NOT public.auth_actor_bound(p_user_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.group_assignment_members
     WHERE group_id = p_group_id AND user_id = p_user_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.user_is_in_group(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_in_group(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_school_ids(uid uuid)
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.auth_actor_bound(uid) THEN
      COALESCE(
        (SELECT ARRAY_AGG(DISTINCT school_id)
           FROM public.user_roles
          WHERE user_id = uid AND is_active = true AND school_id IS NOT NULL),
        '{}'::integer[])
    ELSE '{}'::integer[]
  END;
$$;
REVOKE ALL ON FUNCTION public.user_school_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_school_ids(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Backend-only endpoints (no application caller; service_role EXECUTE only).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_available_assignment_templates(p_course_id uuid)
RETURNS TABLE(template_id uuid, lesson_id uuid, lesson_title character varying, module_title character varying,
              template_title character varying, assignment_type character varying, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_is_backend_caller() AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Backend or admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT at.id, l.id, l.title::character varying, m.title::character varying,
         at.title, at.assignment_type, at.created_at
    FROM public.assignment_templates at
    JOIN public.lessons l ON at.lesson_id = l.id
    JOIN public.modules m ON l.module_id = m.id
   WHERE m.course_id = p_course_id
   -- m.order_index never existed; modules/lessons order by order_number.
   ORDER BY m.order_number, l.order_number, at.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.get_available_assignment_templates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_assignment_templates(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_baseline_permissions(p_role_type text)
RETURNS TABLE(permission_key text, granted boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.permission_key, b.granted
    FROM public.role_permission_baseline b
   WHERE b.role_type = p_role_type
   ORDER BY b.permission_key;
$$;
REVOKE ALL ON FUNCTION public.get_baseline_permissions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_baseline_permissions(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_effective_permissions(p_role_type text, p_test_run_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(permission_key text, granted boolean, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH baseline AS (
    SELECT b.permission_key, b.granted, 'baseline'::text AS source
      FROM public.role_permission_baseline b
     WHERE b.role_type = p_role_type
  ),
  overlays AS (
    SELECT o.permission_key, o.granted, 'test_overlay'::text AS source
      FROM public.role_permissions o
     WHERE o.role_type = p_role_type AND o.is_test = true AND o.active = true
       AND (o.expires_at IS NULL OR o.expires_at > now())
       AND o.test_run_id = p_test_run_id
  ),
  combined AS (
    SELECT ov.permission_key, ov.granted, ov.source FROM overlays ov
    UNION ALL
    SELECT b.permission_key, b.granted, b.source
      FROM baseline b
     WHERE NOT EXISTS (SELECT 1 FROM overlays ov WHERE ov.permission_key = b.permission_key)
  )
  SELECT c.permission_key, c.granted, c.source FROM combined c ORDER BY c.permission_key;
END;
$$;
REVOKE ALL ON FUNCTION public.get_effective_permissions(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_effective_user_role(user_uuid uuid)
RETURNS user_role_type
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_impersonated_role user_role_type;
  v_actual_role user_role_type;
BEGIN
  IF NOT public.auth_actor_bound(user_uuid) THEN
    RETURN NULL;
  END IF;

  IF public.is_dev_user(user_uuid) THEN
    SELECT impersonated_role INTO v_impersonated_role
      FROM public.get_active_dev_impersonation(user_uuid);
    IF v_impersonated_role IS NOT NULL THEN
      RETURN v_impersonated_role;
    END IF;
  END IF;

  SELECT role_type INTO v_actual_role
    FROM public.user_roles
   WHERE user_id = user_uuid AND is_active = true
   ORDER BY CASE role_type
              WHEN 'admin' THEN 1
              WHEN 'consultor' THEN 2
              WHEN 'equipo_directivo' THEN 3
              WHEN 'lider_generacion' THEN 4
              WHEN 'lider_comunidad' THEN 5
              WHEN 'docente' THEN 6
            END
   LIMIT 1;

  IF v_actual_role IS NULL AND public.is_dev_user(user_uuid) THEN
    RETURN 'admin'::user_role_type;
  END IF;
  RETURN v_actual_role;
END;
$$;
REVOKE ALL ON FUNCTION public.get_effective_user_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_user_role(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_admin_status(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_actor_bound(user_uuid) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = user_uuid AND role_type = 'admin' AND is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_admin_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_admin_status(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_messaging_permissions(p_user_id uuid, p_workspace_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_admin_role boolean;
  has_community_leader_role boolean;
BEGIN
  -- p_workspace_id is still not consulted (pre-existing behaviour, recorded);
  -- no messaging permission model is invented here.
  IF NOT public.auth_actor_bound(p_user_id) THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role_type = 'admin' AND is_active = true)
    INTO has_admin_role;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role_type = 'lider_comunidad' AND is_active = true)
    INTO has_community_leader_role;
  RETURN json_build_object(
    'can_view_messages', true,
    'can_send_messages', true,
    'can_create_threads', true,
    'can_edit_own_messages', true,
    'can_delete_own_messages', true,
    'can_moderate_messages', has_admin_role,
    'can_pin_threads', has_admin_role OR has_community_leader_role,
    'can_archive_threads', has_admin_role OR has_community_leader_role,
    'can_upload_attachments', true,
    'can_mention_all', has_admin_role OR has_community_leader_role,
    'can_view_analytics', has_admin_role OR has_community_leader_role,
    'can_manage_reactions', true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_messaging_permissions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_messaging_permissions(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_community_member(check_user_id uuid, check_community_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF check_community_id IS NULL OR NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = check_user_id AND community_id = check_community_id AND is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_community_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Service-only superadmin check (callers: five service-role admin routes,
--    all passing the verified session user's id).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_superadmin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.superadmins
     WHERE user_id = check_user_id AND is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.auth_is_superadmin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_superadmin(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Admin-gated browser endpoint (pages/admin/schools.tsx calls it with the
--    authenticated browser client; the page falls back to a manual count on
--    error, which under RLS yields only the caller's own rows).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_school_user_counts()
RETURNS TABLE(school_id integer, user_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
    END IF;
    -- C-R1-02 (2026-09-08): a definer reader bypasses the restrictive
    -- forced_password_change_guard policy, so it applies the same predicate.
    IF NOT public.password_change_gate_ok() THEN
      RAISE EXCEPTION 'Password change required' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ur.school_id::integer, count(DISTINCT ur.user_id)
    FROM public.user_roles ur
   WHERE ur.school_id IS NOT NULL
   GROUP BY ur.school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_school_user_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_school_user_counts() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_school_user_counts() IS
  'C1 (2026-09-07): aggregate user count per school; literal admin (auth_is_admin) or trusted backend only — 42501 otherwise. authenticated EXECUTE retained for the admin schools page.';
