-- =============================================================================
-- 20260908130000_attach_course_assessment.sql — Procesos de Cambio review
-- remediation, Codex round 3 finding 1 (MAJOR): stale service-role
-- auto-assignment can undo the Operation A cleanup. Additive and idempotent.
--
-- WHAT THIS ADDS
--   public.attach_course_docente_assessment(
--     p_course_structure_id uuid, p_docente_id uuid, p_template_snapshot_id uuid,
--     p_transformation_year integer, p_generation_type text, p_assigned_by uuid)
--   RETURNS jsonb  { instance_id, assignment_id, outcome }
--
--   The ONE transaction in which the automatic course-level assignment writes
--   an assessment instance and/or the docente's assignee grant. Until now the
--   service (lib/services/assessment-builder/autoAssignmentService.ts) issued
--   the lookup, the instance INSERT and the assignee INSERT as separate
--   service-role requests, each its own transaction, each bypassing RLS: a
--   request that had read "docente X is active on course C" before a cleanup
--   could wait behind the cleanup's locks and insert X's grant AFTER the
--   cleanup committed. Row-level security never sees a service-role write, so
--   nothing refused it, and the one-active-assignment index does not
--   constrain assignee grants.
--
--   Inside this function, under the course row lock (FOR UPDATE — the same
--   row Operation A Step 2, replace_course_docente and
--   save_transversal_context lock), every authorization is re-read fresh and
--   the dependent writes happen in the same transaction:
--     1. the docente must hold an ACTIVE course assignment NOW, and the course
--        must hold exactly one active assignment (a course whose invariant is
--        already violated is refused, as the API refuses it);
--     2. the snapshot must belong to a published, non-archived template and
--        be that template's current (newest) snapshot — an archived template
--        never gains an instance or a grant through this path (Step 2e);
--     3. at most one LIVE (non-archived) instance may exist for the course +
--        snapshot; it is locked FOR UPDATE (so a concurrent archive, e.g.
--        Operation A Step 2e, is waited for and re-read), and an archived
--        instance is never reattached (R4);
--     4. the grant is inserted on the live instance (no-op if present), or a
--        new pending instance is created together with the grant.
--   Co-assignees are never read, modified or removed: this function adds at
--   most one grant, for the docente whose active assignment it just verified.
--
-- WHY THIS CLOSES THE RACE
--   Operation A Step 2 takes the course row FOR UPDATE inside its table-level
--   writer-exclusion boundary. A stale attach that arrives during the cleanup
--   waits at the course row; when it resumes, its READ COMMITTED statements
--   take a fresh snapshot in which the obsolete docente's assignment is
--   inactive, and it refuses (P0001 docente_not_active_on_course) before any
--   write. An attach that was already holding the course row when Step 2
--   arrived commits first and Step 2 then re-checks and revokes under its own
--   locks. Either order ends with no grant for the obsolete docente.
--
-- WHEN IT REFUSES (SQLSTATE and stable message code)
--   42501  (no EXECUTE)                     anon / authenticated (service_role only)
--   P0001  invalid_arguments                a NULL argument, a year outside 1..5,
--                                           or an unknown generation type
--   P0001  course_not_found                 the course id is unknown
--   P0001  docente_not_active_on_course     no ACTIVE assignment for this docente
--                                           on this course at write time
--   P0001  assignment_invariant_violation   the course holds MORE than one active
--                                           assignment (administrative resolution)
--   P0001  snapshot_not_found               unknown snapshot id
--   P0001  template_not_eligible            the snapshot's template is archived or
--                                           not published
--   P0001  snapshot_not_current             a newer snapshot of the template exists
--   P0001  instance_ambiguous               two live instances for course + snapshot
--                                           (impossible under the unique index;
--                                           fail closed rather than choose)
--   A refused call writes nothing.
--
-- WHAT IT NEVER TOUCHES
--   assessment_responses, school_course_docente_assignments (read only),
--   assessment_templates / snapshots (read only), archived instances, and
--   every assignee row other than the one it inserts.
--
-- PRIVILEGES (least privilege)
--   SECURITY INVOKER; EXECUTE granted to service_role only. The caller is the
--   server-side service, after the API's own authorization. Nothing else
--   creates course-level instances or docente grants on this branch.
--
-- RECOVERY
--   CREATE OR REPLACE FUNCTION in place; neutralisable without a destructive
--   statement by REVOKE EXECUTE … FROM service_role (operator action, not a
--   migration). It is not part of pilot_schema_attestation's required
--   functions: the pilot tooling does not call it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.attach_course_docente_assessment(
  p_course_structure_id uuid,
  p_docente_id uuid,
  p_template_snapshot_id uuid,
  p_transformation_year integer,
  p_generation_type text,
  p_assigned_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_school_id        integer;
  v_active_count     integer;
  v_assignment_id    uuid;
  v_template_id      uuid;
  v_template_status  text;
  v_template_archived boolean;
  v_snapshot_created timestamptz;
  v_live_ids         uuid[];
  v_instance_id      uuid;
  v_generation       public.generation_type;
  v_grant_inserted   boolean := false;
BEGIN
  IF p_course_structure_id IS NULL OR p_docente_id IS NULL OR p_template_snapshot_id IS NULL
     OR p_transformation_year IS NULL OR p_generation_type IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;
  IF p_transformation_year < 1 OR p_transformation_year > 5 THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001', DETAIL = 'transformation_year must be 1..5';
  END IF;
  BEGIN
    v_generation := p_generation_type::public.generation_type;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001', DETAIL = 'unknown generation_type';
  END;

  -- (1) Course row lock: the serialisation point shared with Operation A
  --     Step 2, replace_course_docente and save_transversal_context. Every
  --     read below happens after any of those has committed or rolled back.
  SELECT school_id INTO v_school_id
    FROM public.school_course_structure
   WHERE id = p_course_structure_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- (2) Fresh assignment authorization, under the lock.
  SELECT count(*) INTO v_active_count
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = p_course_structure_id
     AND is_active = true;
  IF v_active_count > 1 THEN
    RAISE EXCEPTION 'assignment_invariant_violation' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_assignment_id
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = p_course_structure_id
     AND docente_id = p_docente_id
     AND is_active = true;
  IF v_assignment_id IS NULL THEN
    RAISE EXCEPTION 'docente_not_active_on_course' USING ERRCODE = 'P0001';
  END IF;

  -- (3) Template eligibility re-checked at write time (A-01 / Step 2e).
  SELECT t.id, t.status, t.is_archived, s.created_at
    INTO v_template_id, v_template_status, v_template_archived, v_snapshot_created
    FROM public.assessment_template_snapshots s
    JOIN public.assessment_templates t ON t.id = s.template_id
   WHERE s.id = p_template_snapshot_id;
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'snapshot_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_template_archived IS DISTINCT FROM false OR v_template_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'template_not_eligible' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assessment_template_snapshots s2
     WHERE s2.template_id = v_template_id
       AND s2.id <> p_template_snapshot_id
       AND s2.created_at > v_snapshot_created
  ) THEN
    RAISE EXCEPTION 'snapshot_not_current' USING ERRCODE = 'P0001';
  END IF;

  -- (4) The live instance for course + snapshot, locked. An instance archived
  --     by a concurrent transaction (Step 2e) is waited for and then excluded
  --     by the re-evaluated predicate; archived history is never reattached.
  SELECT coalesce(array_agg(id), '{}') INTO v_live_ids
    FROM (
      SELECT i.id
        FROM public.assessment_instances i
       WHERE i.course_structure_id = p_course_structure_id
         AND i.template_snapshot_id = p_template_snapshot_id
         AND i.status <> 'archived'
       ORDER BY i.created_at, i.id
       LIMIT 2
         FOR UPDATE OF i
    ) live;
  IF cardinality(v_live_ids) > 1 THEN
    RAISE EXCEPTION 'instance_ambiguous' USING ERRCODE = 'P0001';
  END IF;

  IF cardinality(v_live_ids) = 1 THEN
    v_instance_id := v_live_ids[1];
    INSERT INTO public.assessment_instance_assignees
      (instance_id, user_id, can_edit, can_submit, assigned_by)
    VALUES (v_instance_id, p_docente_id, true, true, p_assigned_by)
    ON CONFLICT (instance_id, user_id) DO NOTHING;
    v_grant_inserted := FOUND;
    RETURN jsonb_build_object(
      'instance_id', v_instance_id,
      'assignment_id', v_assignment_id,
      'outcome', CASE WHEN v_grant_inserted THEN 'attached' ELSE 'already_exists' END
    );
  END IF;

  INSERT INTO public.assessment_instances
    (template_snapshot_id, school_id, course_structure_id, transformation_year,
     generation_type, status, assigned_by)
  VALUES (p_template_snapshot_id, v_school_id, p_course_structure_id, p_transformation_year,
          v_generation, 'pending', p_assigned_by)
  RETURNING id INTO v_instance_id;

  INSERT INTO public.assessment_instance_assignees
    (instance_id, user_id, can_edit, can_submit, assigned_by)
  VALUES (v_instance_id, p_docente_id, true, true, p_assigned_by);

  RETURN jsonb_build_object(
    'instance_id', v_instance_id,
    'assignment_id', v_assignment_id,
    'outcome', 'created'
  );
END;
$$;

COMMENT ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) IS
  'One transaction for the automatic course-level assignment: under the course row lock it re-verifies the docente''s ACTIVE assignment and the template''s eligibility, then attaches the docente to the live instance for the snapshot or creates the instance with the grant. Refuses (P0001, stable code) before any write; never touches co-assignees, responses or archived instances. service_role only.';

REVOKE ALL ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) TO service_role;
