-- =============================================================================
-- 20261120112000_change_course_docente.sql — GC-20 (F25 build d).
-- «Cambiar docente» once a course's registro was started or sent.
-- Additive: one new table, one new function. replace_course_docente
-- (20260907130000) stays exactly as it is.
--
-- WHAT THIS ADDS
--   public.course_docente_changes
--     One row per change of a course's teacher made through
--     change_course_docente: who changed it, when, the previous and the new
--     teacher, the reason (required when a registro was closed) and the
--     registros the change closed, created, kept and handed over.
--     Readable by assessment admins and the Equipo Directivo of the course's
--     school; nobody signed in can write it (only the function does).
--
--   public.change_course_docente(p_course_structure_id, p_new_docente_id, p_reason)
--     Same arguments checks, course lock, permission, eligibility and
--     active-assignment checks as replace_course_docente, with the same
--     messages and SQLSTATEs. Then, per live registro of the course
--     (status <> 'archived' and not cancelled):
--       SENT      (completed): nothing changes; the new teacher gets nothing
--                 for that instrument. It stays as the course's result.
--       STARTED   (in_progress, or pending with at least one answer): status
--                 becomes 'archived' (it is kept as history and the old
--                 teacher reads it under «Archivados»); the old teacher's grant
--                 stays with can_edit = false and can_submit = false; then a
--                 fresh empty registro for the new teacher on the CURRENT
--                 snapshot of the same instrument, through
--                 attach_course_docente_assessment, in this transaction — only
--                 when the instrument is still published, not archived and
--                 its vía is assigned by course, and the course has no sent
--                 or cancelled registro on that current snapshot. Otherwise
--                 nothing is created for it and the new teacher is attached
--                 to nothing (a newer version arrives by normal delivery).
--       UNTOUCHED (pending, no answer): handed to the new teacher as today:
--                 the old teacher's grant row is given to the new teacher
--                 with fresh flags; if the new teacher already has a row on
--                 that registro, his row gets edit and submit and the old
--                 teacher's row becomes read-only.
--       CANCELLED (cancelled_at set): not touched at all.
--     Answers are never moved, copied or changed. Nothing is removed: grants
--     are handed over by UPDATE.
--
-- WHEN IT REFUSES (in evaluation order; a refused call writes nothing)
--   P0001 invalid_arguments, 42501 permission_denied, P0001 course_not_found,
--   P0001 docente_not_eligible_for_school, no_active_assignment,
--   assignment_invariant_violation, same_docente — as replace_course_docente;
--   P0001 reason_required   a registro would be closed and p_reason is NULL;
--                           DETAIL is {"closing": n, "kept": m};
--   P0001 reason_invalid    a registro would be closed and the reason is blank
--                           or longer than 500 characters;
--   P0001 context_missing   a fresh registro is to be created and the school's
--                           newest transversal context has no year 1-5.
--
-- RECOVERY
--   Replaceable in place with CREATE OR REPLACE FUNCTION; can be switched off
--   without a destructive statement by revoking EXECUTE from authenticated
--   (operator action, not part of any migration).
-- =============================================================================

-- 1. History of changes ------------------------------------------------------
CREATE TABLE public.course_docente_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_structure_id uuid NOT NULL REFERENCES public.school_course_structure(id),
  school_id integer NOT NULL,
  previous_docente_id uuid NOT NULL,
  new_docente_id uuid NOT NULL,
  reason text CHECK (reason IS NULL OR (btrim(reason) <> '' AND char_length(reason) <= 500)),
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  closed_instance_ids uuid[] NOT NULL DEFAULT '{}',
  created_instance_ids uuid[] NOT NULL DEFAULT '{}',
  kept_instance_ids uuid[] NOT NULL DEFAULT '{}',
  moved_instance_ids uuid[] NOT NULL DEFAULT '{}',
  CHECK (cardinality(closed_instance_ids) = 0 OR reason IS NOT NULL)
);

ALTER TABLE public.course_docente_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.course_docente_changes FROM anon, authenticated;
GRANT SELECT ON TABLE public.course_docente_changes TO authenticated;
SELECT public.apply_forced_password_change_guard('public', 'course_docente_changes');

CREATE POLICY course_docente_changes_select ON public.course_docente_changes
  FOR SELECT TO authenticated
  USING (public.auth_is_assessment_admin() OR public.auth_is_school_directivo(school_id));

COMMENT ON TABLE public.course_docente_changes IS
  'GC-20: one row for every change of a course''s teacher made with change_course_docente: who changed it and when, the previous and the new teacher, the reason (required when a started registro was closed) and the registros that were closed as history, created empty for the new teacher, kept as the course''s result, or handed over. Admins and the school''s Equipo Directivo can read it; only the function writes it.';

-- 2. The change ---------------------------------------------------------------
CREATE FUNCTION public.change_course_docente(
  p_course_structure_id uuid,
  p_new_docente_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_school_id integer;
  v_grade_id integer;
  v_active_count integer;
  v_prev_assignment_id uuid;
  v_prev_docente_id uuid;
  v_assignment_id uuid;
  v_sent uuid[];
  v_started uuid[];
  v_untouched uuid[];
  v_fresh_templates uuid[];
  v_reason text;
  v_year integer;
  v_generation public.generation_type;
  v_template_id uuid;
  v_snapshot_id uuid;
  v_result jsonb;
  v_created uuid[] := '{}';
  v_change_id uuid;
BEGIN
  IF p_course_structure_id IS NULL OR p_new_docente_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the course row: two changes of the same course serialise here.
  SELECT school_id, grade_id INTO v_school_id, v_grade_id
    FROM public.school_course_structure
   WHERE id = p_course_structure_id
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Only an admin learns that the course does not exist.
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

  -- Lock the live registros so a docente cannot start or send one while the
  -- change runs, then sort them. Cancelled ones are left out entirely.
  PERFORM 1
     FROM public.assessment_instances
    WHERE course_structure_id = p_course_structure_id
      AND status <> 'archived'
      AND cancelled_at IS NULL
      FOR UPDATE;

  SELECT
      coalesce(array_agg(i.id ORDER BY i.id) FILTER (WHERE i.status = 'completed'), '{}'),
      coalesce(array_agg(i.id ORDER BY i.id) FILTER (WHERE i.status = 'in_progress'
        OR (i.status = 'pending' AND EXISTS (SELECT 1 FROM public.assessment_responses r WHERE r.instance_id = i.id))), '{}'),
      coalesce(array_agg(i.id ORDER BY i.id) FILTER (WHERE i.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM public.assessment_responses r WHERE r.instance_id = i.id)), '{}')
    INTO v_sent, v_started, v_untouched
    FROM public.assessment_instances i
   WHERE i.course_structure_id = p_course_structure_id
     AND i.status <> 'archived'
     AND i.cancelled_at IS NULL;

  IF cardinality(v_started) > 0 THEN
    IF p_reason IS NULL THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001',
        DETAIL = jsonb_build_object('closing', cardinality(v_started), 'kept', cardinality(v_sent))::text;
    END IF;
    v_reason := btrim(p_reason);
    IF v_reason = '' OR char_length(p_reason) > 500 THEN
      RAISE EXCEPTION 'reason_invalid' USING ERRCODE = 'P0001';
    END IF;

    -- Instruments of the closed registros that still take a fresh one.
    SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), '{}') INTO v_fresh_templates
      FROM public.assessment_instances i
      JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
      JOIN public.assessment_templates t ON t.id = s.template_id
      JOIN public.ab_via_assignment_rules r ON r.area = t.area
     WHERE i.id = ANY (v_started)
       AND t.status = 'published'
       AND t.is_archived = false
       AND r.target = 'course_docente';

    IF cardinality(v_fresh_templates) > 0 THEN
      -- Year and generation type exactly as delivery computes them
      -- (20261117160000_deliver_on_publish.sql:262-275).
      SELECT implementation_year_2026 INTO v_year
        FROM public.school_transversal_context
       WHERE school_id = v_school_id
       ORDER BY created_at DESC
       LIMIT 1;
      IF v_year IS NULL OR v_year NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'context_missing' USING ERRCODE = 'P0001';
      END IF;
      v_generation := 'GT';
      IF EXISTS (SELECT 1 FROM public.ab_grades WHERE id = v_grade_id AND NOT is_always_gt) THEN
        SELECT generation_type INTO v_generation
          FROM public.ab_migration_plan
         WHERE school_id = v_school_id AND grade_id = v_grade_id AND year_number = v_year;
        v_generation := coalesce(v_generation, 'GT');
      END IF;
    END IF;
  END IF;

  -- Every check passed: from here on the writes.

  -- 1. Deactivate the previous course assignment.
  UPDATE public.school_course_docente_assignments
     SET is_active = false
   WHERE id = v_prev_assignment_id;

  -- 2. Create or reactivate the new docente's course assignment.
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

  -- 3. STARTED: closed and kept as history; the old teacher may still read it.
  IF cardinality(v_started) > 0 THEN
    UPDATE public.assessment_instances
       SET status = 'archived'
     WHERE id = ANY (v_started);

    UPDATE public.assessment_instance_assignees
       SET can_edit = false,
           can_submit = false
     WHERE instance_id = ANY (v_started)
       AND user_id = v_prev_docente_id;
  END IF;

  -- 4. UNTOUCHED: handed to the new teacher with fresh flags.
  IF cardinality(v_untouched) > 0 THEN
    -- 4a. The new teacher already has a row there: it gets edit and submit,
    --     and the old teacher's row becomes read-only.
    UPDATE public.assessment_instance_assignees
       SET can_edit = true,
           can_submit = true,
           has_started = false,
           has_submitted = false,
           assigned_by = v_caller,
           assigned_at = now()
     WHERE instance_id = ANY (v_untouched)
       AND user_id = p_new_docente_id;

    UPDATE public.assessment_instance_assignees a
       SET can_edit = false,
           can_submit = false
     WHERE a.instance_id = ANY (v_untouched)
       AND a.user_id = v_prev_docente_id
       AND EXISTS (SELECT 1 FROM public.assessment_instance_assignees n
                    WHERE n.instance_id = a.instance_id AND n.user_id = p_new_docente_id);

    -- 4b. Otherwise the old teacher's row is given to the new teacher.
    UPDATE public.assessment_instance_assignees a
       SET user_id = p_new_docente_id,
           can_edit = true,
           can_submit = true,
           has_started = false,
           has_submitted = false,
           assigned_by = v_caller,
           assigned_at = now()
     WHERE a.instance_id = ANY (v_untouched)
       AND a.user_id = v_prev_docente_id
       AND NOT EXISTS (SELECT 1 FROM public.assessment_instance_assignees n
                        WHERE n.instance_id = a.instance_id AND n.user_id = p_new_docente_id);

    -- 4c. Neither had a row (as replace_course_docente attaches him today).
    INSERT INTO public.assessment_instance_assignees
      (instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_by)
    SELECT u.id, p_new_docente_id, true, true, false, false, v_caller
      FROM unnest(v_untouched) AS u(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.assessment_instance_assignees n
                        WHERE n.instance_id = u.id AND n.user_id = p_new_docente_id);
  END IF;

  -- 5. A fresh empty registro for the new teacher per qualifying instrument,
  --    on its newest snapshot (the new assignment is active by now).
  IF cardinality(v_started) > 0 AND cardinality(v_fresh_templates) > 0 THEN
    FOREACH v_template_id IN ARRAY v_fresh_templates LOOP
      SELECT id INTO v_snapshot_id
        FROM public.assessment_template_snapshots
       WHERE template_id = v_template_id
       ORDER BY created_at DESC, id
       LIMIT 1;
      -- The course already has a sent or cancelled registro of this
      -- instrument's current edition: no grant on it, no fresh one.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.assessment_instances x
         WHERE x.course_structure_id = p_course_structure_id
           AND x.template_snapshot_id = v_snapshot_id
           AND x.status <> 'archived'
           AND (x.status = 'completed' OR x.cancelled_at IS NOT NULL));
      v_result := public.attach_course_docente_assessment(
        p_course_structure_id, p_new_docente_id, v_snapshot_id, v_year, v_generation::text, v_caller);
      IF v_result->>'outcome' = 'created' THEN
        v_created := v_created || (v_result->>'instance_id')::uuid;
      END IF;
    END LOOP;
  END IF;

  -- 6. The history row.
  INSERT INTO public.course_docente_changes
    (course_structure_id, school_id, previous_docente_id, new_docente_id, reason, changed_by,
     closed_instance_ids, created_instance_ids, kept_instance_ids, moved_instance_ids)
  VALUES
    (p_course_structure_id, v_school_id, v_prev_docente_id, p_new_docente_id,
     CASE WHEN cardinality(v_started) > 0 THEN v_reason END, v_caller,
     v_started, v_created, v_sent, v_untouched)
  RETURNING id INTO v_change_id;

  RETURN jsonb_build_object(
    'previous_docente_id', v_prev_docente_id,
    'new_docente_id', p_new_docente_id,
    'moved', cardinality(v_untouched),
    'closed', cardinality(v_started),
    'created', cardinality(v_created),
    'kept', cardinality(v_sent),
    'change_id', v_change_id
  );
END;
$$;

COMMENT ON FUNCTION public.change_course_docente(uuid, uuid, text) IS
  'GC-20: changes the active teacher of a course in one transaction. A sent registro stays as the course''s result; a started one (in progress, or pending with an answer) is closed as history (archived, the old teacher keeps reading it) and the new teacher gets an empty one on the current version of the instrument when it is still published; an untouched pending one is handed to the new teacher; a cancelled one is left alone. Closing needs a reason of 1-500 characters (reason_required, reason_invalid); every change leaves one row in course_docente_changes. Answers are never moved, copied or changed. Same permission and refusals as replace_course_docente.';

REVOKE ALL ON FUNCTION public.change_course_docente(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_course_docente(uuid, uuid, text) TO authenticated, service_role;
