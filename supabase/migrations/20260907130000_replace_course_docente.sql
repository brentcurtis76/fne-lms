-- =============================================================================
-- 20260907130000_replace_course_docente.sql — Procesos de Cambio remediation,
-- PR 2 item 2: safe docente replacement. Additive and idempotent.
--
-- WHAT THIS ADDS
--   public.replace_course_docente(p_course_structure_id, p_new_docente_id)
--   One transactional RPC that swaps the active docente of a course while the
--   evaluation has NOT started. Under the course row lock it:
--     1. deactivates the previous course assignment
--        (school_course_docente_assignments.is_active = false);
--     2. removes the previous docente's assignee rows on every non-archived
--        assessment instance of the course;
--     3. creates, or reactivates, the new docente's course assignment;
--     4. attaches the new docente as assignee (can_edit / can_submit = true,
--        has_started / has_submitted = false) on each of those instances.
--   The four steps run in one statement's transaction: either all of them
--   land or none does.
--
-- WHEN IT REFUSES (SQLSTATE and stable message code, in evaluation order)
--   42501  permission_denied                caller is neither an assessment
--                                           admin nor a directivo of the
--                                           course's school (a course the
--                                           caller cannot see answers the same)
--   P0001  course_not_found                 admin only: the course id is unknown
--   P0001  docente_not_eligible_for_school  the new docente has no active
--                                           teaching-eligible role at the
--                                           course's school
--   P0001  no_active_assignment             the course has no active docente
--   P0001  assignment_invariant_violation   the course has MORE than one active
--                                           docente (administrative resolution)
--   P0001  same_docente                     the new docente is the active one
--   P0001  evaluation_started: instances_started=<n> instances_with_responses=<m>
--                                           some non-archived instance is not
--                                           `pending`, or holds a response row.
--                                           DETAIL carries the same counts as
--                                           JSON {"instances_started":n,
--                                           "instances_with_responses":m}.
--   A refused call writes nothing.
--
-- WHAT IT NEVER TOUCHES
--   assessment_responses (no row is read for transfer, moved, or deleted),
--   assessment_instances (status, snapshot and every other column stay as
--   they are), archived instances and their assignees, assignee rows that
--   belong to anyone other than the previous docente.
--
-- RECOVERY
--   The function is replaceable in place with CREATE OR REPLACE FUNCTION and
--   can be neutralised without a destructive statement by revoking EXECUTE:
--     REVOKE EXECUTE ON FUNCTION public.replace_course_docente(uuid, uuid)
--       FROM authenticated;
--   (operator action, intentionally not part of any migration). It mutates
--   only school_course_docente_assignments and assessment_instance_assignees;
--   a replacement is reversible by calling it again with the previous docente
--   as long as the evaluation still has not started.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_course_docente(
  p_course_structure_id uuid,
  p_new_docente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_school_id integer;
  v_active_count integer;
  v_prev_assignment_id uuid;
  v_prev_docente_id uuid;
  v_instances_started integer;
  v_instances_with_responses integer;
  v_assignment_id uuid;
  v_instances_reattached integer;
BEGIN
  IF p_course_structure_id IS NULL OR p_new_docente_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the course row: two replacements of the same course serialise here.
  SELECT school_id INTO v_school_id
    FROM public.school_course_structure
   WHERE id = p_course_structure_id
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Only an admin learns that the course does not exist; everybody else
    -- gets the same answer as for a course they may not touch.
    IF public.auth_is_assessment_admin() THEN
      RAISE EXCEPTION 'course_not_found' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.auth_is_assessment_admin() OR public.auth_is_school_directivo(v_school_id)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- The new docente must hold an active teaching-eligible role at the
  -- course's school (mirrors TEACHING_ELIGIBLE_ROLES in utils/roleUtils.ts).
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = p_new_docente_id
       AND school_id = v_school_id
       AND is_active = true
       AND role_type IN ('docente', 'admin', 'consultor', 'equipo_directivo',
                         'lider_generacion', 'lider_comunidad')
  ) THEN
    RAISE EXCEPTION 'docente_not_eligible_for_school' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the active assignment rows of the course, then classify them.
  PERFORM 1
     FROM public.school_course_docente_assignments
    WHERE course_structure_id = p_course_structure_id
      AND is_active = true
      FOR UPDATE;

  SELECT count(*) INTO v_active_count
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = p_course_structure_id
     AND is_active = true;

  IF v_active_count = 0 THEN
    RAISE EXCEPTION 'no_active_assignment' USING ERRCODE = 'P0001';
  ELSIF v_active_count > 1 THEN
    RAISE EXCEPTION 'assignment_invariant_violation' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, docente_id INTO v_prev_assignment_id, v_prev_docente_id
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = p_course_structure_id
     AND is_active = true;

  IF v_prev_docente_id = p_new_docente_id THEN
    RAISE EXCEPTION 'same_docente' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the live instances so a docente cannot start one while the swap
  -- runs, then verify none has started and none holds an answer.
  PERFORM 1
     FROM public.assessment_instances
    WHERE course_structure_id = p_course_structure_id
      AND status <> 'archived'
      FOR UPDATE;

  SELECT
      count(*) FILTER (WHERE i.status <> 'pending'),
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.assessment_responses r WHERE r.instance_id = i.id
      ))
    INTO v_instances_started, v_instances_with_responses
    FROM public.assessment_instances i
   WHERE i.course_structure_id = p_course_structure_id
     AND i.status <> 'archived';

  IF v_instances_started > 0 OR v_instances_with_responses > 0 THEN
    RAISE EXCEPTION 'evaluation_started: instances_started=% instances_with_responses=%',
      v_instances_started, v_instances_with_responses
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'instances_started', v_instances_started,
              'instances_with_responses', v_instances_with_responses
            )::text;
  END IF;

  -- 1. Deactivate the previous course assignment.
  UPDATE public.school_course_docente_assignments
     SET is_active = false
   WHERE id = v_prev_assignment_id;

  -- 2. Revoke the previous docente's access to the live instances. Archived
  --    instances and every other assignee are left alone.
  DELETE FROM public.assessment_instance_assignees a
   USING public.assessment_instances i
   WHERE a.instance_id = i.id
     AND i.course_structure_id = p_course_structure_id
     AND i.status <> 'archived'
     AND a.user_id = v_prev_docente_id;

  -- 3. Create or reactivate the new docente's course assignment.
  UPDATE public.school_course_docente_assignments
     SET is_active = true,
         assigned_by = v_caller,
         assigned_at = now()
   WHERE course_structure_id = p_course_structure_id
     AND docente_id = p_new_docente_id
   RETURNING id INTO v_assignment_id;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.school_course_docente_assignments
      (course_structure_id, docente_id, assigned_by, is_active)
    VALUES (p_course_structure_id, p_new_docente_id, v_caller, true)
    RETURNING id INTO v_assignment_id;
  END IF;

  -- 4. Attach the new docente to every live instance with fresh flags.
  INSERT INTO public.assessment_instance_assignees
    (instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_by)
  SELECT i.id, p_new_docente_id, true, true, false, false, v_caller
    FROM public.assessment_instances i
   WHERE i.course_structure_id = p_course_structure_id
     AND i.status <> 'archived'
  ON CONFLICT (instance_id, user_id) DO UPDATE
     SET can_edit = true,
         can_submit = true,
         has_started = false,
         has_submitted = false,
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = now();
  GET DIAGNOSTICS v_instances_reattached = ROW_COUNT;

  RETURN jsonb_build_object(
    'previous_docente_id', v_prev_docente_id,
    'new_docente_id', p_new_docente_id,
    'instances_reattached', v_instances_reattached,
    'assignment_id', v_assignment_id
  );
END;
$$;

COMMENT ON FUNCTION public.replace_course_docente(uuid, uuid) IS
  'Atomically replaces the active docente of a course while every live assessment instance is pending and answer-free. Mutates only school_course_docente_assignments and assessment_instance_assignees; never touches assessment_responses. Raises 42501 (permission_denied) or P0001 with a stable message code.';

REVOKE ALL ON FUNCTION public.replace_course_docente(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.replace_course_docente(uuid, uuid) TO authenticated, service_role;
