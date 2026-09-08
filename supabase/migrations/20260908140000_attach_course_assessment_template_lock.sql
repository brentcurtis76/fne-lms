-- =============================================================================
-- 20260908140000_attach_course_assessment_template_lock.sql — Procesos de
-- Cambio review remediation, Codex round 4 finding R5-1 (MAJOR): the template
-- eligibility decision of attach_course_docente_assessment became stale
-- before the RPC wrote. Additive follow-up to 20260908130000 (CREATE OR
-- REPLACE of the same function, same signature, same privileges).
--
-- THE RACE (reproduced by Codex on the local stack, Step 2e ordering)
--   The round-4 function read the template's status / is_archived with a
--   plain SELECT, then waited for the live-instance row lock (or for the
--   Operation A writer-exclusion boundary). A template archive that
--   committed WHILE the RPC was waiting was never re-read: the RPC resumed,
--   found the original instance archived by Step 2e, and — the template
--   check long past — created a NEW pending instance with an editable grant
--   under a template that was archived at commit time. Adding another
--   unlocked SELECT after the wait would leave the same class of race
--   (check, then wait, then write).
--
-- THE PROTOCOL (what this migration enforces)
--   The template row is locked FOR SHARE before its eligibility is read and
--   the lock is held until the RPC's transaction ends. FOR SHARE conflicts
--   with FOR UPDATE / FOR NO KEY UPDATE, i.e. with every UPDATE of that row:
--   the archive route (`UPDATE assessment_templates SET is_archived = true`),
--   the restore route, and the publish flip (`SET status = 'published'`).
--     * Archive first: the RPC's FOR SHARE waits for the archive to commit
--       and then re-evaluates the row (READ COMMITTED lock re-check): it
--       sees is_archived = true and refuses (template_not_eligible) before
--       any write, however long it later waits at the instance row or at the
--       boundary.
--     * RPC first: the archive's UPDATE waits until the RPC commits. The
--       instance / grant the RPC created is therefore COMMITTED and visible
--       before is_archived = true can commit, so an Operation A Step 1c
--       discovery run after the archive necessarily lists it and Step 2e
--       archives it and revokes its grants. There is no order in which a
--       live instance is created under a template whose archive committed
--       before the creation.
--   Both orders are proved with three concurrent sessions and final-state
--   assertions in scripts/ci/operation-a-proof.mjs [2e-r5] (existing-instance
--   and create paths). Step 2e itself now takes the same FOR SHARE on the
--   template row (handoff document), so a restore cannot commit under it.
--
-- WHAT IS ENFORCED FOR THE "CURRENT SNAPSHOT" CHECK — stated exactly
--   The check "no newer snapshot of this template exists" is evaluated as the
--   LAST read before the write, after the instance row lock, against the
--   committed snapshots at that moment. It is NOT protected by the template
--   lock: publishTemplate inserts the new snapshot in its own request and
--   only its later template UPDATE waits on FOR SHARE. So a snapshot
--   committed after that read and before the RPC commits is not excluded.
--   That residual outcome is an instance bound to the previous snapshot,
--   which is exactly the state every existing instance is in after a
--   republish and is not an access decision; the eligibility decision
--   (published, not archived), which IS an access decision, is the one the
--   lock protects. The earlier documentation that called the current-snapshot
--   check part of the enforced protocol is corrected in the handoff document.
--
-- LOCK ORDER (unchanged prefix, one row lock added)
--   course row FOR UPDATE → template row FOR SHARE → live instance FOR UPDATE
--   → INSERTs. Nothing on this branch locks a template row and then the
--   course row, and the Operation A boundary never touches the template
--   table, so no cycle is introduced (Step 2e: table locks → template FOR
--   SHARE, which is compatible with the RPC's FOR SHARE).
--
-- WHAT DID NOT CHANGE
--   Signature, return shape, every refusal code, SECURITY INVOKER, EXECUTE
--   for service_role only, the course-row protocol of Step 2, the R4 rule
--   (an archived instance is never reattached; a fresh live instance is
--   created when the template is eligible), and the co-assignee guarantee.
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

  -- (3) Template eligibility, decided under a FOR SHARE lock on the template
  --     row that is held until this transaction ends (R5-1). An archive,
  --     restore or publish flip of the template either committed before this
  --     read (and is seen: the lock re-evaluates the row) or waits until this
  --     transaction has committed or rolled back. The decision cannot go
  --     stale while the RPC waits further down.
  SELECT s.template_id, s.created_at
    INTO v_template_id, v_snapshot_created
    FROM public.assessment_template_snapshots s
   WHERE s.id = p_template_snapshot_id;
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'snapshot_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.status, t.is_archived
    INTO v_template_status, v_template_archived
    FROM public.assessment_templates t
   WHERE t.id = v_template_id
     FOR SHARE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_template_archived IS DISTINCT FROM false OR v_template_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'template_not_eligible' USING ERRCODE = 'P0001';
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

  -- (5) Current snapshot: the last read before the write, against committed
  --     snapshots at this moment (see the header: not protected by a lock;
  --     the residual outcome equals a publish that landed after this attach).
  IF EXISTS (
    SELECT 1 FROM public.assessment_template_snapshots s2
     WHERE s2.template_id = v_template_id
       AND s2.id <> p_template_snapshot_id
       AND s2.created_at > v_snapshot_created
  ) THEN
    RAISE EXCEPTION 'snapshot_not_current' USING ERRCODE = 'P0001';
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
  'One transaction for the automatic course-level assignment: under the course row lock it re-verifies the docente''s ACTIVE assignment, then decides the template''s eligibility under a FOR SHARE lock on the template row held to the end of the transaction (an archive / restore / publish flip waits or is seen), then attaches the docente to the live instance for the snapshot or creates the instance with the grant. Refuses (P0001, stable code) before any write; never touches co-assignees, responses or archived instances. service_role only.';

REVOKE ALL ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) TO service_role;
