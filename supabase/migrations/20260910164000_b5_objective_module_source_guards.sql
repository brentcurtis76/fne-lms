-- PROC-B5 F2: source revision guards for assessment_objectives and
-- assessment_modules (direct children of assessment_templates).
--
-- Scope: objective and module rows only. Indicators, year expectations, year
-- weights and grade tables are NOT guarded here, so the full template source
-- graph is still not guarded. Dormant foundation: no application caller, no
-- publication/CAS logic. Additive only. Reuses the F1 owner-only helper
-- public.bump_template_source_revisions(uuid[]) unmodified.
--
-- Membership is the direct template_id column (no ancestry lookup):
--   INSERT bumps NEW.template_id; DELETE bumps OLD.template_id; UPDATE bumps
--   OLD.template_id and NEW.template_id when a serialized field changes (the
--   helper dedups and locks parents in id order before any counter).
-- created_at/updated_at are not serialized for these children and never bump
-- on their own. Cascaded deletes still call the helper, which ignores templates
-- already deleted in the same statement, so no orphan counter is created.

-- ---------------------------------------------------------------------------
-- guard_assessment_objective_source_revision
-- Serialized fields: id, template_id, name, description, display_order, weight.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_assessment_objective_source_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.bump_template_source_revisions(ARRAY[NEW.template_id]);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.bump_template_source_revisions(ARRAY[OLD.template_id]);
  ELSIF ROW(OLD.id, OLD.template_id, OLD.name, OLD.description, OLD.display_order, OLD.weight)
        IS DISTINCT FROM
        ROW(NEW.id, NEW.template_id, NEW.name, NEW.description, NEW.display_order, NEW.weight)
  THEN
    PERFORM public.bump_template_source_revisions(ARRAY[OLD.template_id, NEW.template_id]);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.guard_assessment_objective_source_revision() IS
  'PROC-B5 F2 owner-only source guard for assessment_objectives. Bumps direct template_id parents. No API grants.';

REVOKE ALL ON FUNCTION public.guard_assessment_objective_source_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assessment_objectives_source_revision_guard
AFTER INSERT OR UPDATE OR DELETE ON public.assessment_objectives
FOR EACH ROW
EXECUTE FUNCTION public.guard_assessment_objective_source_revision();

COMMENT ON TRIGGER assessment_objectives_source_revision_guard ON public.assessment_objectives IS
  'PROC-B5 F2: bumps template source revision on objective insert/delete and serialized field changes.';

-- ---------------------------------------------------------------------------
-- guard_assessment_module_source_revision
-- Serialized fields: id, template_id, objective_id, name, description,
-- instructions, display_order, weight.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_assessment_module_source_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.bump_template_source_revisions(ARRAY[NEW.template_id]);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.bump_template_source_revisions(ARRAY[OLD.template_id]);
  ELSIF ROW(OLD.id, OLD.template_id, OLD.objective_id, OLD.name, OLD.description,
            OLD.instructions, OLD.display_order, OLD.weight)
        IS DISTINCT FROM
        ROW(NEW.id, NEW.template_id, NEW.objective_id, NEW.name, NEW.description,
            NEW.instructions, NEW.display_order, NEW.weight)
  THEN
    PERFORM public.bump_template_source_revisions(ARRAY[OLD.template_id, NEW.template_id]);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.guard_assessment_module_source_revision() IS
  'PROC-B5 F2 owner-only source guard for assessment_modules. Bumps direct template_id parents. No API grants.';

REVOKE ALL ON FUNCTION public.guard_assessment_module_source_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assessment_modules_source_revision_guard
AFTER INSERT OR UPDATE OR DELETE ON public.assessment_modules
FOR EACH ROW
EXECUTE FUNCTION public.guard_assessment_module_source_revision();

COMMENT ON TRIGGER assessment_modules_source_revision_guard ON public.assessment_modules IS
  'PROC-B5 F2: bumps template source revision on module insert/delete and serialized field changes.';
