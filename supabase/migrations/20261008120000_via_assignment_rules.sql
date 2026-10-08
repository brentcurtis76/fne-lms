-- =============================================================================
-- 20261008120000_via_assignment_rules.sql — registros are assigned by vía.
--
-- Plan: ~/Projects/pm-workflow/reviews/via-rules-20261008/PLAN.md (Codex plan
-- reviews r1–r4 beside it).
--
-- WHAT THIS ADDS
--   ab_via_assignment_rules      one row per vía (assessment_templates.area):
--                                'course_docente' (one registro per course, for
--                                the docente assigned in Contexto Transversal) or
--                                'school_responsible' (one registro per school,
--                                for the Equipo Directivo person picked for that
--                                vía). Changed only by a reviewed migration that
--                                calls set_via_assignment_rule().
--   school_via_responsibles      the picked person per (school, vía); one active.
--   school_via_instance_links    provenance: the school-level instances this flow
--                                created. Only linked instances are ever touched
--                                by assign / replace. Pre-existing school-level
--                                instances have no link and are never touched.
--   lock_via_rule(area)          service-role helper: FOR SHARE on the rule row,
--                                returns its target (FOR SHARE needs UPDATE
--                                privilege, which the invoker RPCs must not hold).
--   assessment_template_via_rule_guard   templates must fit their vía's rule:
--                                course_docente ⇔ grade_id NOT NULL. Checked under
--                                FOR SHARE on the rule row, so a rule change and a
--                                publish/restore are serialized.
--   assign_school_via_responsible / replace_school_via_responsible
--                                service_role-only RPCs (SECURITY INVOKER) that
--                                assign, re-send or replace and attach the
--                                responsible to the vía's school-level registros.
--   assessment_response_via_guard   on LINKED instances only: a response save
--                                waits for a concurrent replace and re-checks that
--                                the writer is still an editing assignee.
--   attach_course_docente_assessment   amended: refuses a template whose vía rule
--                                is not 'course_docente' (or is missing).
--
-- WHAT DOES NOT CHANGE
--   Existing instances, assignees, responses and snapshots. Publish / archive
--   routes. The course-assignment protocol apart from the added rule check.
--
-- LOCK ORDER
--   course RPC:   course row → template FOR SHARE → rule FOR SHARE → instance
--   school RPCs:  advisory (school, vía) → rule FOR SHARE → the vía's linked
--                 instances FOR UPDATE (ascending id) → template FOR SHARE
--   response save on a linked instance: parent instances FOR SHARE (ascending id)
--   template write: template row (UPDATE) → rule FOR SHARE
--   rule change:  rule FOR UPDATE → plain reads
--   Rule locks taken by RPCs and the template guard are all FOR SHARE (mutually
--   compatible); the only exclusive rule lock is the rule change, which locks
--   nothing else. No cycle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rules
-- -----------------------------------------------------------------------------
CREATE TABLE public.ab_via_assignment_rules (
  area       text PRIMARY KEY
             CHECK (area IN ('personalizacion', 'aprendizaje', 'evaluacion', 'proposito',
                             'familias', 'trabajo_docente', 'liderazgo')),
  target     text NOT NULL CHECK (target IN ('course_docente', 'school_responsible')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ab_via_assignment_rules IS
  'Who answers each vía''s registros. course_docente: one registro per course for its assigned docente. school_responsible: one registro per school for the Equipo Directivo person picked for the vía. Changed only by a reviewed migration through set_via_assignment_rule(); personalizacion (Crecimiento) is fixed to course_docente.';

INSERT INTO public.ab_via_assignment_rules (area, target) VALUES
  ('personalizacion', 'course_docente'),
  ('aprendizaje',     'course_docente'),
  ('evaluacion',      'course_docente'),
  ('trabajo_docente', 'course_docente'),
  ('familias',        'course_docente'),
  ('liderazgo',       'school_responsible'),
  ('proposito',       'school_responsible');

ALTER TABLE public.ab_via_assignment_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ab_via_assignment_rules FROM public, anon, authenticated, service_role;
GRANT SELECT ON public.ab_via_assignment_rules TO authenticated, service_role;

CREATE POLICY ab_via_assignment_rules_read ON public.ab_via_assignment_rules
  FOR SELECT TO authenticated, service_role USING (true);
SELECT public.apply_forced_password_change_guard('public', 'ab_via_assignment_rules');

-- FOR SHARE on the rule row, held to the end of the caller's transaction.
-- Returns NULL when the vía has no rule (callers fail closed).
CREATE FUNCTION public.lock_via_rule(p_area text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target FROM public.ab_via_assignment_rules WHERE area = p_area FOR SHARE
$$;

REVOKE ALL ON FUNCTION public.lock_via_rule(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_via_rule(text) TO service_role;

-- The only way a rule changes. Not granted to any API role: a future reviewed
-- migration calls it. Refuses personalizacion, and any vía that has a published
-- template (archived included: a restore would bring it back) or any instance.
CREATE FUNCTION public.set_via_assignment_rule(p_area text, p_target text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current text;
BEGIN
  IF p_area = 'personalizacion' THEN
    RAISE EXCEPTION 'via_rule_locked' USING ERRCODE = 'P0001';
  END IF;
  IF p_target NOT IN ('course_docente', 'school_responsible') THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  SELECT target INTO v_current FROM public.ab_via_assignment_rules WHERE area = p_area FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'via_rule_missing' USING ERRCODE = 'P0001';
  END IF;
  IF v_current = p_target THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.assessment_templates WHERE area = p_area AND status = 'published') THEN
    RAISE EXCEPTION 'via_rule_has_published_templates' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assessment_instances i
      JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
      JOIN public.assessment_templates t ON t.id = s.template_id
     WHERE t.area = p_area
  ) THEN
    RAISE EXCEPTION 'via_rule_has_instances' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ab_via_assignment_rules SET target = p_target, updated_at = now() WHERE area = p_area;
END;
$$;

REVOKE ALL ON FUNCTION public.set_via_assignment_rule(text, text) FROM public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Templates must fit their vía's rule
-- -----------------------------------------------------------------------------
-- Checked whenever a template IS LIVE after the write (status = 'published' and
-- is_archived = false) and the write is an INSERT or changes status / grade_id /
-- area / is_archived: publish, restore, or editing a live template's grade or
-- vía. The rule row is locked FOR SHARE, so this serializes with
-- set_via_assignment_rule (a rule change either sees the published template and
-- refuses, or commits first and the publish is checked against the new rule).
-- A vía with no rule can never go live. Drafts and archived templates are not
-- checked here (the builder API validates drafts), so drafts that predate the
-- rules stay editable until their grade is corrected.
CREATE FUNCTION public.assessment_template_via_rule_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.grade_id IS NOT DISTINCT FROM OLD.grade_id
     AND NEW.area IS NOT DISTINCT FROM OLD.area
     AND NEW.is_archived IS NOT DISTINCT FROM OLD.is_archived THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'published' OR NEW.is_archived IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  SELECT target INTO v_target FROM public.ab_via_assignment_rules WHERE area = NEW.area FOR SHARE;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'via_rule_missing' USING ERRCODE = 'P0001', DETAIL = format('area %s', NEW.area);
  END IF;
  IF v_target = 'course_docente' AND NEW.grade_id IS NULL THEN
    RAISE EXCEPTION 'template_grade_required' USING ERRCODE = 'P0001',
      DETAIL = 'Esta vía se asigna por curso: el template necesita un nivel.';
  END IF;
  IF v_target = 'school_responsible' AND NEW.grade_id IS NOT NULL THEN
    RAISE EXCEPTION 'template_grade_not_allowed' USING ERRCODE = 'P0001',
      DETAIL = 'Esta vía se asigna a un responsable del equipo directivo: el template no lleva nivel.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_template_via_rule_guard() FROM public, anon, authenticated;

CREATE TRIGGER assessment_template_via_rule_guard_trg
  BEFORE INSERT OR UPDATE ON public.assessment_templates
  FOR EACH ROW EXECUTE FUNCTION public.assessment_template_via_rule_guard();

-- Grade-less templates are told apart by name: versions are unique per
-- (area, name) when there is no grade. The graded key (area, grade_id, version)
-- is unchanged.
CREATE UNIQUE INDEX assessment_templates_gradeless_version_key
  ON public.assessment_templates (area, btrim(name), version)
  WHERE grade_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Responsibles and provenance
-- -----------------------------------------------------------------------------
CREATE TABLE public.school_via_responsibles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    integer NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  area         text NOT NULL REFERENCES public.ab_via_assignment_rules(area),
  user_id      uuid NOT NULL REFERENCES public.profiles(id),
  assigned_by  uuid NOT NULL REFERENCES public.profiles(id),
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  is_active    boolean NOT NULL DEFAULT true,
  replaced_at  timestamptz,
  replaced_by  uuid REFERENCES public.profiles(id),
  CONSTRAINT school_via_responsibles_replaced_consistent CHECK (
    (is_active AND replaced_at IS NULL AND replaced_by IS NULL)
    OR (NOT is_active AND replaced_at IS NOT NULL AND replaced_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX school_via_responsibles_one_active_key
  ON public.school_via_responsibles (school_id, area) WHERE is_active;
CREATE INDEX school_via_responsibles_user_idx ON public.school_via_responsibles (user_id);

COMMENT ON TABLE public.school_via_responsibles IS
  'The Equipo Directivo person who answers a school_responsible vía for a school. One active row per (school, vía); replaced rows are kept as history. Written only by assign_/replace_school_via_responsible.';

ALTER TABLE public.school_via_responsibles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_via_responsibles FROM public, anon, authenticated, service_role;
GRANT SELECT ON public.school_via_responsibles TO authenticated;
-- service_role writes only through the SECURITY INVOKER RPCs below (the API
-- holds no other code path that writes this table).
GRANT SELECT, INSERT, UPDATE ON public.school_via_responsibles TO service_role;

-- Admins see all; an active Equipo Directivo member sees their own school.
-- Consultores read through the API (service client) after the assignment-scoped
-- check in lib/permissions/directivo.ts.
CREATE POLICY school_via_responsibles_read ON public.school_via_responsibles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.is_active IS TRUE
         AND (ur.role_type = 'admin'
              OR (ur.role_type = 'equipo_directivo' AND ur.school_id = school_via_responsibles.school_id))
    )
  );
CREATE POLICY school_via_responsibles_service_read ON public.school_via_responsibles
  FOR SELECT TO service_role USING (true);
SELECT public.apply_forced_password_change_guard('public', 'school_via_responsibles');

CREATE TABLE public.school_via_instance_links (
  instance_id uuid PRIMARY KEY REFERENCES public.assessment_instances(id) ON DELETE CASCADE,
  school_id   integer NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  area        text NOT NULL REFERENCES public.ab_via_assignment_rules(area),
  template_id uuid NOT NULL REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_via_instance_links_one_per_template UNIQUE (school_id, template_id)
);

CREATE INDEX school_via_instance_links_school_area_idx ON public.school_via_instance_links (school_id, area);

COMMENT ON TABLE public.school_via_instance_links IS
  'Provenance of the school-level registros created for a vía responsible: one per (school, template). A link always blocks recreation, so cancelled work is never silently remade. Service role only.';

ALTER TABLE public.school_via_instance_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_via_instance_links FROM public, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.school_via_instance_links TO service_role;
CREATE POLICY school_via_instance_links_service_read ON public.school_via_instance_links
  FOR SELECT TO service_role USING (true);
SELECT public.apply_forced_password_change_guard('public', 'school_via_instance_links');

-- -----------------------------------------------------------------------------
-- 4. School-vía RPCs
-- -----------------------------------------------------------------------------
-- Shared checks, run under the (school, vía) advisory lock. Raises on refusal.
CREATE FUNCTION public.school_via_check(
  p_school_id integer, p_area text, p_user_id uuid, p_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target text;
BEGIN
  IF p_school_id IS NULL OR p_area IS NULL OR p_user_id IS NULL OR p_by IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  v_target := public.lock_via_rule(p_area);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'via_rule_missing' USING ERRCODE = 'P0001';
  END IF;
  IF v_target <> 'school_responsible' THEN
    RAISE EXCEPTION 'via_not_school_level' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_by AND is_active IS TRUE
       AND (role_type = 'admin' OR (role_type = 'equipo_directivo' AND school_id = p_school_id))
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user_id AND is_active IS TRUE
       AND role_type = 'equipo_directivo' AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'responsible_not_eligible' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.school_via_check(integer, text, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_via_check(integer, text, uuid, uuid) TO service_role;

-- Attach step: for each eligible template of the vía (published, not archived,
-- grade-less, under FOR SHARE), make sure the responsible is an assignee of the
-- school's linked instance, or create instance + link + grant. A cancelled
-- linked instance, or one already archived, is reported and left alone.
-- Returns a jsonb array of per-template outcomes.
CREATE FUNCTION public.school_via_attach(
  p_school_id integer, p_area text, p_user_id uuid, p_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year        integer;
  v_tpl         record;
  v_snapshot_id uuid;
  v_link        record;
  v_instance_id uuid;
  v_out         jsonb := '[]'::jsonb;
BEGIN
  SELECT implementation_year_2026 INTO v_year
    FROM public.school_transversal_context
   WHERE school_id = p_school_id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_year IS NULL OR v_year < 1 OR v_year > 5 THEN
    RAISE EXCEPTION 'context_missing' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the vía's existing linked registros up front in ascending id order,
  -- the order replace_school_via_responsible and the response guard use, so
  -- no two of them can deadlock. The per-template FOR UPDATE below then only
  -- re-reads rows this transaction already holds.
  PERFORM 1
     FROM public.assessment_instances i
     JOIN public.school_via_instance_links l ON l.instance_id = i.id
    WHERE l.school_id = p_school_id AND l.area = p_area
    ORDER BY i.id
      FOR UPDATE OF i;

  FOR v_tpl IN
    SELECT t.id, t.name
      FROM public.assessment_templates t
     WHERE t.area = p_area AND t.status = 'published' AND t.is_archived = false
     ORDER BY t.name, t.id
       FOR SHARE OF t
  LOOP
    -- the row lock re-evaluates the predicate; a template archived meanwhile
    -- is skipped, never attached.
    SELECT s.id INTO v_snapshot_id
      FROM public.assessment_template_snapshots s
     WHERE s.template_id = v_tpl.id
     ORDER BY s.created_at DESC, s.id
     LIMIT 1;
    IF v_snapshot_id IS NULL THEN
      RAISE EXCEPTION 'snapshot_missing' USING ERRCODE = 'P0001', DETAIL = v_tpl.name;
    END IF;

    SELECT l.instance_id, i.cancelled_at, i.status
      INTO v_link
      FROM public.school_via_instance_links l
      JOIN public.assessment_instances i ON i.id = l.instance_id
     WHERE l.school_id = p_school_id AND l.template_id = v_tpl.id
       FOR UPDATE OF i;

    IF FOUND THEN
      IF v_link.cancelled_at IS NOT NULL THEN
        v_out := v_out || jsonb_build_object('template_id', v_tpl.id, 'template_name', v_tpl.name,
                                             'instance_id', v_link.instance_id, 'outcome', 'cancelled');
      ELSIF v_link.status = 'archived' THEN
        v_out := v_out || jsonb_build_object('template_id', v_tpl.id, 'template_name', v_tpl.name,
                                             'instance_id', v_link.instance_id, 'outcome', 'archived');
      ELSE
        -- The responsible always answers: an existing read-only grant of the
        -- same person is upgraded; other co-assignees are never touched.
        INSERT INTO public.assessment_instance_assignees AS a
          (instance_id, user_id, can_edit, can_submit, assigned_by)
        VALUES (v_link.instance_id, p_user_id, true, true, p_by)
        ON CONFLICT (instance_id, user_id) DO UPDATE
          SET can_edit = true, can_submit = true
          WHERE a.can_edit IS NOT TRUE OR a.can_submit IS NOT TRUE;
        v_out := v_out || jsonb_build_object('template_id', v_tpl.id, 'template_name', v_tpl.name,
                                             'instance_id', v_link.instance_id,
                                             'outcome', CASE WHEN FOUND THEN 'attached' ELSE 'already_exists' END);
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.assessment_instances
      (template_snapshot_id, school_id, course_structure_id, transformation_year,
       generation_type, status, assigned_by)
    VALUES (v_snapshot_id, p_school_id, NULL, v_year, 'GT', 'pending', p_by)
    RETURNING id INTO v_instance_id;

    INSERT INTO public.school_via_instance_links (instance_id, school_id, area, template_id)
    VALUES (v_instance_id, p_school_id, p_area, v_tpl.id);

    INSERT INTO public.assessment_instance_assignees
      (instance_id, user_id, can_edit, can_submit, assigned_by)
    VALUES (v_instance_id, p_user_id, true, true, p_by);

    v_out := v_out || jsonb_build_object('template_id', v_tpl.id, 'template_name', v_tpl.name,
                                         'instance_id', v_instance_id, 'outcome', 'created');
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.school_via_attach(integer, text, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_via_attach(integer, text, uuid, uuid) TO service_role;

-- Assign (no active responsible), or re-send (same person active). A different
-- active person is refused: that is a replacement.
CREATE FUNCTION public.assign_school_via_responsible(
  p_school_id integer, p_area text, p_user_id uuid, p_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current uuid;
  v_mode    text := 'assigned';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('school_via'), hashtext(p_school_id::text || ':' || coalesce(p_area, '')));
  PERFORM public.school_via_check(p_school_id, p_area, p_user_id, p_by);

  SELECT user_id INTO v_current
    FROM public.school_via_responsibles
   WHERE school_id = p_school_id AND area = p_area AND is_active;

  IF v_current IS NOT NULL AND v_current <> p_user_id THEN
    RAISE EXCEPTION 'responsible_already_assigned' USING ERRCODE = 'P0001';
  END IF;

  IF v_current IS NULL THEN
    INSERT INTO public.school_via_responsibles (school_id, area, user_id, assigned_by)
    VALUES (p_school_id, p_area, p_user_id, p_by);
  ELSE
    v_mode := 'resent';
  END IF;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'details', public.school_via_attach(p_school_id, p_area, p_user_id, p_by)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_school_via_responsible(integer, text, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_school_via_responsible(integer, text, uuid, uuid) TO service_role;

-- Replace: allowed only while every linked registro of (school, vía) is
-- untouched. Otherwise refused as a whole, naming the touched registros.
CREATE FUNCTION public.replace_school_via_responsible(
  p_school_id integer, p_area text, p_new_user_id uuid, p_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old     record;
  v_touched jsonb;
  v_moved   integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('school_via'), hashtext(p_school_id::text || ':' || coalesce(p_area, '')));
  PERFORM public.school_via_check(p_school_id, p_area, p_new_user_id, p_by);

  SELECT id, user_id INTO v_old
    FROM public.school_via_responsibles
   WHERE school_id = p_school_id AND area = p_area AND is_active
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_active_responsible' USING ERRCODE = 'P0001';
  END IF;
  IF v_old.user_id = p_new_user_id THEN
    RAISE EXCEPTION 'same_responsible' USING ERRCODE = 'P0001';
  END IF;

  -- Lock every linked instance, then decide. A response save holds FOR SHARE on
  -- its instance (assessment_response_via_guard) until it commits, so it is
  -- either visible here or waits and is refused afterwards.
  PERFORM 1
     FROM public.assessment_instances i
     JOIN public.school_via_instance_links l ON l.instance_id = i.id
    WHERE l.school_id = p_school_id AND l.area = p_area
    ORDER BY i.id
      FOR UPDATE OF i;

  SELECT coalesce(jsonb_agg(jsonb_build_object('instance_id', i.id, 'template_id', l.template_id)
                            ORDER BY i.id), '[]'::jsonb)
    INTO v_touched
    FROM public.assessment_instances i
    JOIN public.school_via_instance_links l ON l.instance_id = i.id
   WHERE l.school_id = p_school_id AND l.area = p_area
     AND (
       i.status <> 'pending'
       OR i.started_at IS NOT NULL
       OR i.completed_at IS NOT NULL
       OR i.cancelled_at IS NOT NULL
       OR (i.context_responses IS NOT NULL AND i.context_responses NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb))
       OR EXISTS (SELECT 1 FROM public.assessment_responses r WHERE r.instance_id = i.id)
       OR EXISTS (SELECT 1 FROM public.assessment_instance_assignees a
                   WHERE a.instance_id = i.id AND (a.has_started IS TRUE OR a.has_submitted IS TRUE))
     );

  IF jsonb_array_length(v_touched) > 0 THEN
    RAISE EXCEPTION 'registros_already_started' USING ERRCODE = 'P0001', DETAIL = v_touched::text;
  END IF;

  UPDATE public.school_via_responsibles
     SET is_active = false, replaced_at = now(), replaced_by = p_by
   WHERE id = v_old.id;

  INSERT INTO public.school_via_responsibles (school_id, area, user_id, assigned_by)
  VALUES (p_school_id, p_area, p_new_user_id, p_by);

  -- The previous responsible's own grants move to the new person on EVERY
  -- linked registro (all untouched, checked above), including one whose
  -- template was archived after assignment: the transfer does not depend on
  -- delivery eligibility. Co-assignees stay; a read-only grant the new person
  -- already held is upgraded.
  DELETE FROM public.assessment_instance_assignees a
   USING public.school_via_instance_links l
   WHERE a.instance_id = l.instance_id
     AND l.school_id = p_school_id AND l.area = p_area
     AND a.user_id = v_old.user_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  INSERT INTO public.assessment_instance_assignees AS a
    (instance_id, user_id, can_edit, can_submit, assigned_by)
  SELECT l.instance_id, p_new_user_id, true, true, p_by
    FROM public.school_via_instance_links l
   WHERE l.school_id = p_school_id AND l.area = p_area
  ON CONFLICT (instance_id, user_id) DO UPDATE
    SET can_edit = true, can_submit = true
    WHERE a.can_edit IS NOT TRUE OR a.can_submit IS NOT TRUE;

  RETURN jsonb_build_object(
    'mode', 'replaced',
    'previous_user_id', v_old.user_id,
    'grants_removed', v_moved,
    'details', public.school_via_attach(p_school_id, p_area, p_new_user_id, p_by)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_school_via_responsible(integer, text, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_school_via_responsible(integer, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Response saves on linked instances
-- -----------------------------------------------------------------------------
-- Applies only to instances that have a link row (read as definer, so RLS can't
-- hide it). Takes FOR SHARE on each parent (old and new), then re-checks, after
-- the lock, that the instance is not cancelled and that an authenticated writer
-- is still an editing assignee. Backend writers (no auth.uid()) are unchanged.
CREATE FUNCTION public.assessment_response_via_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent    uuid;
  v_cancelled timestamptz;
  v_uid       uuid := auth.uid();
BEGIN
  -- Distinct parents in ascending id order: the same order in which
  -- replace_school_via_responsible locks a vía's instances, so a response moved
  -- between two linked registros can never deadlock against a replace.
  FOR v_parent IN
    SELECT DISTINCT p FROM unnest(ARRAY[
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.instance_id END,
      NEW.instance_id
    ]) AS p
     WHERE p IS NOT NULL
     ORDER BY p
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.school_via_instance_links WHERE instance_id = v_parent);

    SELECT cancelled_at INTO v_cancelled
      FROM public.assessment_instances WHERE id = v_parent FOR SHARE;
    IF v_cancelled IS NOT NULL THEN
      RAISE EXCEPTION 'instance_cancelled' USING ERRCODE = 'P0001';
    END IF;

    IF v_uid IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.assessment_instance_assignees
       WHERE instance_id = v_parent AND user_id = v_uid AND can_edit IS TRUE
    ) THEN
      RAISE EXCEPTION 'not_an_assignee' USING ERRCODE = '42501',
        DETAIL = 'Este registro fue reasignado a otra persona.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assessment_response_via_guard() FROM public, anon, authenticated;

CREATE TRIGGER assessment_response_via_guard_trg
  BEFORE INSERT OR UPDATE ON public.assessment_responses
  FOR EACH ROW EXECUTE FUNCTION public.assessment_response_via_guard();

-- -----------------------------------------------------------------------------
-- 6. Course RPC: refuse templates whose vía is not course_docente
-- -----------------------------------------------------------------------------
-- Same body as 20260908140000 plus step (3b). Signature, return shape,
-- refusal codes, SECURITY INVOKER and grants unchanged.
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
  v_template_area    text;
  v_via_target       text;
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

  -- (1) Course row lock.
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

  -- (3) Template eligibility under FOR SHARE on the template row.
  SELECT s.template_id, s.created_at
    INTO v_template_id, v_snapshot_created
    FROM public.assessment_template_snapshots s
   WHERE s.id = p_template_snapshot_id;
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'snapshot_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT t.status, t.is_archived, t.area
    INTO v_template_status, v_template_archived, v_template_area
    FROM public.assessment_templates t
   WHERE t.id = v_template_id
     FOR SHARE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_template_archived IS DISTINCT FROM false OR v_template_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'template_not_eligible' USING ERRCODE = 'P0001';
  END IF;

  -- (3b) The vía must be assigned by course (rule row FOR SHARE, held to the end).
  v_via_target := public.lock_via_rule(v_template_area);
  IF v_via_target IS NULL THEN
    RAISE EXCEPTION 'via_rule_missing' USING ERRCODE = 'P0001';
  END IF;
  IF v_via_target <> 'course_docente' THEN
    RAISE EXCEPTION 'via_not_course_level' USING ERRCODE = 'P0001';
  END IF;

  -- (4) The live instance for course + snapshot, locked.
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

  -- (5) Current snapshot: the last read before the write.
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
  'One transaction for the automatic course-level assignment: under the course row lock it re-verifies the docente''s ACTIVE assignment, decides the template''s eligibility under FOR SHARE on the template row, requires the template''s vía rule to be course_docente (rule row FOR SHARE), then attaches the docente to the live instance for the snapshot or creates the instance with the grant. Refuses (P0001, stable code) before any write; never touches co-assignees, responses or archived instances. service_role only.';

REVOKE ALL ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) TO service_role;
