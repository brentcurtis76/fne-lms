-- PROC-B5 F1: template source revision bump primitive + root UPDATE guard.
--
-- Scope: ROOT public.assessment_templates row only. Child source tables and
-- grade tables are NOT guarded here; their guards are pending later B5 units,
-- so the full template source graph is not yet guarded. Dormant foundation:
-- no application caller, no publication/CAS logic. Additive only.

-- ---------------------------------------------------------------------------
-- bump_template_source_revisions: owner-only primitive.
-- Locks existing parent templates FOR UPDATE in id order BEFORE touching any
-- counter (lock order template -> revision, shared with future publication),
-- then increments each locked template's counter exactly once (absent => 1).
-- NULL/empty input, NULL elements and missing/deleted ids are ignored.
-- BIGINT overflow raises 22003 and rolls back the calling statement.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.bump_template_source_revisions(p_template_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_locked_ids UUID[] := '{}'::UUID[];
  v_template_id UUID;
BEGIN
  IF p_template_ids IS NULL OR cardinality(p_template_ids) = 0 THEN
    RETURN;
  END IF;

  -- Each existing template matches once, so duplicates/NULLs collapse here.
  FOR v_template_id IN
    SELECT t.id
      FROM public.assessment_templates t
     WHERE t.id = ANY (p_template_ids)
     ORDER BY t.id
       FOR UPDATE
  LOOP
    v_locked_ids := array_append(v_locked_ids, v_template_id);
  END LOOP;

  FOREACH v_template_id IN ARRAY v_locked_ids LOOP
    INSERT INTO public.assessment_template_source_revisions AS r (template_id, revision)
    VALUES (v_template_id, 1)
    ON CONFLICT (template_id) DO UPDATE
      SET revision = r.revision + 1;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.bump_template_source_revisions(UUID[]) IS
  'PROC-B5 F1 owner-only: lock templates (id order) then increment source revision once per existing id. No API grants.';

REVOKE ALL ON FUNCTION public.bump_template_source_revisions(UUID[])
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- guard_assessment_template_source_revision: ROOT-ONLY trigger function.
-- Bumps NEW.id once when a serialized root source field changes. Mechanical
-- fields (version, status, published_*, updated_at, created_by, archive
-- fields) do not bump on their own. No INSERT trigger (new template is
-- implicit revision 0); no DELETE trigger (counter FK cascades).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_assessment_template_source_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(OLD.name, OLD.description, OLD.area, OLD.grade_id, OLD.scoring_config, OLD.created_at)
     IS DISTINCT FROM
     ROW(NEW.name, NEW.description, NEW.area, NEW.grade_id, NEW.scoring_config, NEW.created_at)
  THEN
    PERFORM public.bump_template_source_revisions(ARRAY[NEW.id]);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.guard_assessment_template_source_revision() IS
  'PROC-B5 F1 root-only source guard for assessment_templates. Child and grade-table guards are pending later units.';

REVOKE ALL ON FUNCTION public.guard_assessment_template_source_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assessment_templates_source_revision_guard
AFTER UPDATE ON public.assessment_templates
FOR EACH ROW
EXECUTE FUNCTION public.guard_assessment_template_source_revision();

COMMENT ON TRIGGER assessment_templates_source_revision_guard ON public.assessment_templates IS
  'PROC-B5 F1 root-only: bumps source revision on root serialized field changes. Not a full source-graph guard.';
