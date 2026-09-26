-- PROC-B5 F3: source revision guard for assessment_entity_year_weights
-- (direct child of assessment_templates).
--
-- Scope: year weight rows only. Indicators, year expectations and grade tables
-- are NOT guarded here, so the full template source graph is still not
-- guarded. Dormant foundation: no application caller, no publication/CAS
-- logic, no change to stored weights or calibration/scoring policy. Additive
-- only. Reuses the F1 owner-only helper
-- public.bump_template_source_revisions(uuid[]) unmodified.
--
-- Membership is the direct template_id column (no ancestry lookup):
--   INSERT bumps NEW.template_id; DELETE bumps OLD.template_id; UPDATE bumps
--   OLD.template_id and NEW.template_id when a serialized field changes (the
--   helper dedups and locks parents in id order before any counter).
-- The publisher serializes entity_type, entity_id, year and weight per
-- template; id, created_at and updated_at are not serialized and never bump on
-- their own. Cascaded deletes still call the helper, which ignores templates
-- already deleted in the same statement, so no orphan counter is created.

-- ---------------------------------------------------------------------------
-- guard_assessment_year_weight_source_revision
-- Serialized fields: template_id, entity_type, entity_id, year, weight.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_assessment_year_weight_source_revision()
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
  ELSIF ROW(OLD.template_id, OLD.entity_type, OLD.entity_id, OLD.year, OLD.weight)
        IS DISTINCT FROM
        ROW(NEW.template_id, NEW.entity_type, NEW.entity_id, NEW.year, NEW.weight)
  THEN
    PERFORM public.bump_template_source_revisions(ARRAY[OLD.template_id, NEW.template_id]);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.guard_assessment_year_weight_source_revision() IS
  'PROC-B5 F3 owner-only source guard for assessment_entity_year_weights. Bumps direct template_id parents. No API grants.';

REVOKE ALL ON FUNCTION public.guard_assessment_year_weight_source_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assessment_entity_year_weights_source_revision_guard
AFTER INSERT OR UPDATE OR DELETE ON public.assessment_entity_year_weights
FOR EACH ROW
EXECUTE FUNCTION public.guard_assessment_year_weight_source_revision();

COMMENT ON TRIGGER assessment_entity_year_weights_source_revision_guard ON public.assessment_entity_year_weights IS
  'PROC-B5 F3: bumps template source revision on year weight insert/delete and serialized field changes.';
