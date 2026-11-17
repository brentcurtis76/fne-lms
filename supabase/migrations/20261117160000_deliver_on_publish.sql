-- GC-3a: registros reach their courses at publication, not at the next sweep.
--
-- Two service-role functions used by the publish route (a SECOND call made
-- after publish_assessment_template has committed; never inside it, because
-- attach locks course then template while publish locks the template first):
--
--   preview_template_delivery(template)   how many courses / schools a
--                                          publication would actually deliver
--                                          to: the sweep's candidates that also
--                                          pass delivery's per-pair checks
--                                          (read only, no lock, works on a draft)
--   deliver_published_template(template)  delivers exactly the pairs the
--                                          every-minute sweep would deliver for
--                                          this one template
--
-- The candidate query and the per-pair block are copies of
-- public.reconcile_published_assessment_deliveries
-- (20261116160000_reconcile_assessment_delivery.sql). THE TWO MUST STAY EQUAL:
-- who receives what is decided there, and supabase/tests/131-deliver-on-publish.sql
-- pins that delivery and the sweep agree. The sweep stays the safety net for
-- every pair this call leaves undelivered. Existing instances, grants and
-- responses are never changed or revived, in any status.

CREATE FUNCTION public.preview_template_delivery(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target text;
  v_courses integer := 0;
  v_schools integer := 0;
BEGIN
  -- Plain read of the rule (no lock_via_rule: that takes FOR SHARE).
  SELECT r.target INTO v_target
    FROM public.assessment_templates t
    JOIN public.ab_via_assignment_rules r ON r.area = t.area
   WHERE t.id = p_template_id;

  -- Counts only the pairs deliver_published_template would create: its
  -- candidate query (without requiring status = 'published': the editor asks
  -- while it is a draft) plus, read-only and without any lock, the same
  -- conditions its per-pair block checks. Keep equal to that block.
  IF v_target = 'course_docente' THEN
    SELECT count(*)::integer, count(DISTINCT x.school_id)::integer
      INTO v_courses, v_schools
      FROM (
        SELECT DISTINCT c.id, c.school_id
          FROM public.school_course_structure c
          JOIN public.school_course_docente_assignments a ON a.course_structure_id = c.id AND a.is_active
          JOIN public.assessment_templates t ON t.grade_id = c.grade_id AND NOT t.is_archived
          JOIN public.ab_via_assignment_rules r ON r.area = t.area AND r.target = 'course_docente'
         WHERE t.id = p_template_id
           AND NOT EXISTS (
             SELECT 1 FROM public.assessment_instances i
             JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
             WHERE i.course_structure_id = c.id AND s.template_id = t.id
           )
           -- exactly one active teacher assignment
           AND (SELECT count(*) FROM public.school_course_docente_assignments a1
                 WHERE a1.course_structure_id = c.id AND a1.is_active) = 1
           -- that teacher holds an active role delivery accepts at the course's school
           AND EXISTS (
             SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = a.docente_id AND ur.school_id = c.school_id AND ur.is_active
                AND ur.role_type IN ('docente', 'admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad')
           )
           -- the school's newest context has a usable year
           AND (SELECT sc.implementation_year_2026 FROM public.school_transversal_context sc
                 WHERE sc.school_id = c.school_id ORDER BY sc.created_at DESC LIMIT 1) BETWEEN 1 AND 5
           -- a snapshot exists, or the template is still a draft (none yet)
           AND (t.status = 'draft' OR EXISTS (
             SELECT 1 FROM public.assessment_template_snapshots s2 WHERE s2.template_id = t.id
           ))
      ) x;
  ELSIF v_target = 'school_responsible' THEN
    SELECT count(DISTINCT a.school_id)::integer INTO v_schools
      FROM public.school_via_responsibles a
      JOIN public.assessment_templates t ON t.area = a.area AND NOT t.is_archived AND t.grade_id IS NULL
      JOIN public.ab_via_assignment_rules r ON r.area = t.area AND r.target = 'school_responsible'
     WHERE t.id = p_template_id
       AND a.is_active
       AND NOT EXISTS (SELECT 1 FROM public.school_via_instance_links l WHERE l.school_id = a.school_id AND l.template_id = t.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.assessment_instances i
         JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
         WHERE i.school_id = a.school_id AND i.course_structure_id IS NULL AND s.template_id = t.id
       )
       -- the active responsable holds an active equipo_directivo role at that school
       AND EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = a.user_id AND ur.school_id = a.school_id AND ur.is_active
            AND ur.role_type = 'equipo_directivo'
       )
       -- the school's newest context has a usable year
       AND (SELECT sc.implementation_year_2026 FROM public.school_transversal_context sc
             WHERE sc.school_id = a.school_id ORDER BY sc.created_at DESC LIMIT 1) BETWEEN 1 AND 5
       -- a snapshot exists, or the template is still a draft (none yet)
       AND (t.status = 'draft' OR EXISTS (
         SELECT 1 FROM public.assessment_template_snapshots s2 WHERE s2.template_id = t.id
       ));
  ELSE
    v_target := NULL;
  END IF;

  RETURN jsonb_build_object('target', v_target, 'courses', coalesce(v_courses, 0), 'schools', coalesce(v_schools, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.preview_template_delivery(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_template_delivery(uuid) TO service_role;
COMMENT ON FUNCTION public.preview_template_delivery(uuid) IS
  'Read-only count of the courses (course_docente) or schools (school_responsible) that would actually be delivered to if this template were published now: the candidate query of deliver_published_template / reconcile_published_assessment_deliveries for one template, without requiring published status (works on a draft), restricted to the pairs that also pass delivery''s per-pair checks (exactly one active teacher with an accepted active role at the school, or an active responsable with an active equipo_directivo role there; a usable context year; a snapshot unless still a draft). Archived templates count zero. Writes nothing, takes no lock. Service role only.';

CREATE FUNCTION public.deliver_published_template(p_template_id uuid, p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
SET lock_timeout = '500ms'
AS $$
DECLARE
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
  v_failures jsonb := '[]'::jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assessment_templates
     WHERE id = p_template_id AND status = 'published' AND NOT is_archived
  ) THEN
    RETURN jsonb_build_object('created', 0, 'skipped', 0, 'failed', 0, 'has_more', false,
                              'failures', '[]'::jsonb, 'reason', 'template_not_published');
  END IF;
  -- No global sweep lock and no cursor: this call is independent of the
  -- sweep; both re-check under the same per-pair locks, so they never
  -- deliver a pair twice.

  -- Candidate query: copy of the sweep's (20261116160000:51-76), restricted
  -- to this template. Keep equal to the sweep.
  FOR v_candidate IN
    SELECT * FROM (
      SELECT DISTINCT 'c:' || c.id::text || ':' || t.id::text AS scan_key,
             c.id AS course_id, c.school_id, t.id AS template_id, t.area, 'course_docente'::text AS target
        FROM public.school_course_structure c
        JOIN public.school_course_docente_assignments a ON a.course_structure_id = c.id AND a.is_active
        JOIN public.assessment_templates t ON t.grade_id = c.grade_id AND t.status = 'published' AND NOT t.is_archived
        JOIN public.ab_via_assignment_rules r ON r.area = t.area AND r.target = 'course_docente'
       WHERE t.id = p_template_id
         AND NOT EXISTS (
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
       WHERE t.id = p_template_id
         AND a.is_active
         AND NOT EXISTS (SELECT 1 FROM public.school_via_instance_links l WHERE l.school_id = a.school_id AND l.template_id = t.id)
         AND NOT EXISTS (
           SELECT 1 FROM public.assessment_instances i
           JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
           WHERE i.school_id = a.school_id AND i.course_structure_id IS NULL AND s.template_id = t.id
         )
    ) candidates
    ORDER BY scan_key
    LIMIT p_limit
  LOOP
    v_scanned := v_scanned + 1;
    -- Per-pair block: copy of the sweep's (20261116160000:84-180). Keep equal.
    BEGIN
      v_user := NULL;
      v_by := NULL;
      IF v_candidate.target = 'course_docente' THEN
        -- Skip a busy course rather than wait; the sweep retries it.
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
        -- Same mutex as assign/replace_school_via_responsible and the sweep.
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

      -- Recheck after the locks; never revive archived or cancelled work and
      -- never upgrade a snapshot or an existing grant.
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
      -- Ids and the stable exception code only: no names, no e-mails.
      v_failures := v_failures || jsonb_build_array(
        CASE WHEN v_candidate.course_id IS NOT NULL
          THEN jsonb_build_object('course_id', v_candidate.course_id, 'code', left(SQLERRM, 60))
          ELSE jsonb_build_object('school_id', v_candidate.school_id, 'code', left(SQLERRM, 60))
        END);
    END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'failed', v_failed,
                            'has_more', v_scanned = p_limit, 'failures', v_failures);
END;
$$;
REVOKE ALL ON FUNCTION public.deliver_published_template(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_published_template(uuid, integer) TO service_role;
COMMENT ON FUNCTION public.deliver_published_template(uuid, integer) IS
  'Delivery at publication: for one published, non-archived template, delivers exactly the pairs reconcile_published_assessment_deliveries would (same candidate query, same per-pair locks and re-checks, each pair in its own subtransaction; the two must stay equal). Failed pairs are listed with ids and codes only and left to the sweep. Never touches the sweep cursor or its lock, never changes an existing instance, grant or response. Service role only.';
