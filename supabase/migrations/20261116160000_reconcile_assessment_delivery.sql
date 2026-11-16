-- Deliver late publications to existing assignments. Existing work is immutable
-- here: a scope/template match in ANY version or status prevents creation.
-- A durable cursor advances past invalid scopes as well as successes, so one
-- broken assignment cannot starve the rest of the platform on repeated ticks.
CREATE TABLE public.assessment_delivery_reconcile_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  scan_key text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assessment_delivery_reconcile_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assessment_delivery_reconcile_state FROM public, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.assessment_delivery_reconcile_state TO service_role;
CREATE POLICY assessment_delivery_reconcile_service ON public.assessment_delivery_reconcile_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
SELECT public.apply_forced_password_change_guard('public', 'assessment_delivery_reconcile_state');
INSERT INTO public.assessment_delivery_reconcile_state (singleton) VALUES (true);

CREATE FUNCTION public.reconcile_published_assessment_deliveries(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
SET lock_timeout = '500ms'
AS $$
DECLARE
  v_cursor text;
  v_candidate record;
  v_course public.school_course_structure%ROWTYPE;
  v_template record;
  v_user uuid;
  v_by uuid;
  v_snapshot uuid;
  v_instance uuid;
  v_year integer;
  v_generation public.generation_type;
  v_result jsonb;
  v_scanned integer := 0;
  v_created integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;
  -- One sweep at a time, including overlapping Vercel invocations.
  IF NOT pg_try_advisory_xact_lock(hashtext('assessment_delivery_reconcile'), 0) THEN
    RETURN jsonb_build_object('scanned', 0, 'created', 0, 'skipped', 0, 'failed', 0, 'busy', true);
  END IF;
  SELECT scan_key INTO STRICT v_cursor
    FROM public.assessment_delivery_reconcile_state WHERE singleton;

  FOR v_candidate IN
    SELECT * FROM (
      SELECT DISTINCT 'c:' || c.id::text || ':' || t.id::text AS scan_key,
             c.id AS course_id, c.school_id, t.id AS template_id, t.area, 'course_docente'::text AS target
        FROM public.school_course_structure c
        JOIN public.school_course_docente_assignments a ON a.course_structure_id = c.id AND a.is_active
        JOIN public.assessment_templates t ON t.grade_id = c.grade_id AND t.status = 'published' AND NOT t.is_archived
        JOIN public.ab_via_assignment_rules r ON r.area = t.area AND r.target = 'course_docente'
       WHERE NOT EXISTS (
         SELECT 1 FROM public.assessment_instances i
         JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
         WHERE i.course_structure_id = c.id AND s.template_id = t.id
       )
      UNION ALL
      SELECT 's:' || a.school_id::text || ':' || t.id::text,
             NULL::uuid, a.school_id, t.id, t.area, 'school_responsible'::text
        FROM public.school_via_responsibles a
        JOIN public.assessment_templates t ON t.area = a.area AND t.status = 'published' AND NOT t.is_archived AND t.grade_id IS NULL
        JOIN public.ab_via_assignment_rules r ON r.area = t.area AND r.target = 'school_responsible'
       WHERE a.is_active
         AND NOT EXISTS (SELECT 1 FROM public.school_via_instance_links l WHERE l.school_id = a.school_id AND l.template_id = t.id)
         AND NOT EXISTS (
           SELECT 1 FROM public.assessment_instances i
           JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
           WHERE i.school_id = a.school_id AND i.course_structure_id IS NULL AND s.template_id = t.id
         )
    ) candidates
    WHERE scan_key > v_cursor
    ORDER BY scan_key
    LIMIT p_limit
  LOOP
    v_scanned := v_scanned + 1;
    v_cursor := v_candidate.scan_key;
    -- A subtransaction makes a failed pair atomic while retaining progress.
    BEGIN
      v_user := NULL;
      v_by := NULL;
      IF v_candidate.target = 'course_docente' THEN
        -- Context saves can lock several courses in a different order. A
        -- background sweep must skip a busy course rather than form a cycle;
        -- the cursor advances and retries this pair on a later sweep.
        SELECT * INTO v_course FROM public.school_course_structure
          WHERE id = v_candidate.course_id FOR UPDATE NOWAIT;
        IF NOT FOUND OR v_course.school_id <> v_candidate.school_id THEN
          RAISE EXCEPTION 'scope_changed';
        END IF;
        IF (SELECT count(*) FROM public.school_course_docente_assignments
             WHERE course_structure_id = v_course.id AND is_active) <> 1 THEN
          RAISE EXCEPTION 'assignment_invariant_violation';
        END IF;
        SELECT docente_id, assigned_by INTO v_user, v_by
          FROM public.school_course_docente_assignments
         WHERE course_structure_id = v_course.id AND is_active FOR SHARE;
        PERFORM 1 FROM public.user_roles
         WHERE user_id = v_user AND school_id = v_course.school_id AND is_active
           AND role_type IN ('docente', 'admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad')
         FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'recipient_not_eligible'; END IF;
      ELSE
        -- Same mutex as assign/replace_school_via_responsible.
        PERFORM pg_advisory_xact_lock(hashtext('school_via'), hashtext(v_candidate.school_id::text || ':' || v_candidate.area));
        IF public.lock_via_rule(v_candidate.area) IS DISTINCT FROM 'school_responsible' THEN
          RAISE EXCEPTION 'via_changed';
        END IF;
        SELECT user_id, assigned_by INTO v_user, v_by FROM public.school_via_responsibles
         WHERE school_id = v_candidate.school_id AND area = v_candidate.area AND is_active FOR SHARE;
        IF v_user IS NULL THEN RAISE EXCEPTION 'responsible_changed'; END IF;
        PERFORM 1 FROM public.user_roles
         WHERE user_id = v_user AND school_id = v_candidate.school_id AND is_active AND role_type = 'equipo_directivo'
         FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'recipient_not_eligible'; END IF;
      END IF;

      SELECT * INTO v_template FROM public.assessment_templates
       WHERE id = v_candidate.template_id AND status = 'published' AND is_archived = false FOR SHARE;
      IF NOT FOUND OR v_template.area <> v_candidate.area THEN RAISE EXCEPTION 'template_changed'; END IF;
      IF public.lock_via_rule(v_template.area) IS DISTINCT FROM v_candidate.target THEN RAISE EXCEPTION 'via_changed'; END IF;
      IF (v_candidate.target = 'course_docente' AND v_template.grade_id IS DISTINCT FROM v_course.grade_id)
         OR (v_candidate.target = 'school_responsible' AND v_template.grade_id IS NOT NULL) THEN
        RAISE EXCEPTION 'grade_changed';
      END IF;

      -- Recheck after the assignment mutex; another assign request may have
      -- delivered while this sweep was waiting. Never revive archived or
      -- cancelled work and never upgrade a snapshot or an existing grant.
      IF EXISTS (
        SELECT 1 FROM public.assessment_instances i
        JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
        WHERE s.template_id = v_template.id
          AND ((v_candidate.course_id IS NOT NULL AND i.course_structure_id = v_candidate.course_id)
            OR (v_candidate.course_id IS NULL AND i.school_id = v_candidate.school_id AND i.course_structure_id IS NULL))
      ) OR (v_candidate.course_id IS NULL AND EXISTS (
        SELECT 1 FROM public.school_via_instance_links l
         WHERE l.school_id = v_candidate.school_id AND l.template_id = v_template.id
      )) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT implementation_year_2026 INTO v_year FROM public.school_transversal_context
       WHERE school_id = v_candidate.school_id ORDER BY created_at DESC LIMIT 1;
      IF v_year IS NULL OR v_year NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'context_missing'; END IF;
      SELECT id INTO v_snapshot FROM public.assessment_template_snapshots
       WHERE template_id = v_template.id ORDER BY created_at DESC, id LIMIT 1;
      IF v_snapshot IS NULL THEN RAISE EXCEPTION 'snapshot_missing'; END IF;

      v_generation := 'GT';
      IF v_candidate.course_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.ab_grades WHERE id = v_course.grade_id AND NOT is_always_gt) THEN
          SELECT generation_type INTO v_generation FROM public.ab_migration_plan
           WHERE school_id = v_candidate.school_id AND grade_id = v_course.grade_id AND year_number = v_year;
          v_generation := coalesce(v_generation, 'GT');
        END IF;
        v_result := public.attach_course_docente_assessment(v_candidate.course_id, v_user, v_snapshot, v_year, v_generation::text, v_by);
        IF v_result->>'outcome' = 'created' THEN v_created := v_created + 1;
        ELSE v_skipped := v_skipped + 1; END IF;
      ELSE
        INSERT INTO public.assessment_instances
          (template_snapshot_id, school_id, course_structure_id, transformation_year, generation_type, status, assigned_by)
        VALUES (v_snapshot, v_candidate.school_id, NULL, v_year, 'GT', 'pending', v_by)
        RETURNING id INTO v_instance;
        INSERT INTO public.school_via_instance_links(instance_id, school_id, area, template_id)
        VALUES (v_instance, v_candidate.school_id, v_template.area, v_template.id);
        INSERT INTO public.assessment_instance_assignees(instance_id, user_id, can_edit, can_submit, assigned_by)
        VALUES (v_instance, v_user, true, true, v_by);
        v_created := v_created + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE public.assessment_delivery_reconcile_state
     SET scan_key = CASE WHEN v_scanned < p_limit THEN '' ELSE v_cursor END, updated_at = now()
   WHERE singleton;
  RETURN jsonb_build_object('scanned', v_scanned, 'created', v_created, 'skipped', v_skipped,
                           'failed', v_failed, 'busy', false, 'has_more', v_scanned = p_limit);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_published_assessment_deliveries(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_published_assessment_deliveries(integer) TO service_role;
COMMENT ON FUNCTION public.reconcile_published_assessment_deliveries(integer) IS
  'Bounded automatic delivery of published registros to existing eligible assignments; stable-template dedupe preserves every existing version/status/grant; durable round-robin cursor retries failed scopes without starving others. Service role only.';
