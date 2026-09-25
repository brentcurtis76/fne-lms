-- PROC-B5 F4: source revision guard for assessment_year_expectations
-- (direct child of assessment_templates via template_id).
--
-- Scope: year expectation rows only. Indicators and grade tables are NOT
-- guarded here, so the full template source graph is still not guarded.
-- Dormant foundation: no application caller, no publication/CAS logic, no
-- change to stored expectations or calibration/scoring policy. Additive only.
-- Reuses the F1 owner-only helper public.bump_template_source_revisions(uuid[])
-- unmodified.
--
-- Membership is the direct template_id column (no ancestry lookup):
--   INSERT bumps NEW.template_id; DELETE bumps OLD.template_id; UPDATE bumps
--   OLD.template_id and NEW.template_id when a serialized field changes (the
--   helper dedups and locks parents in id order before any counter).
-- The indicator_id FK does not require the indicator to belong to the same
-- template, so a cascade from another template's indicator can delete a row
-- whose own template survives. DELETE therefore bumps OLD.template_id directly
-- even when the indicator or its ancestors are already gone. Cascaded deletes
-- of a deleted template still call the helper, which ignores templates already
-- deleted in the same statement, so no orphan counter is created.
-- The publisher groups rows by indicator_id and generation_type per template
-- and serializes year_1..5_expected, year_1..5_expected_unit and tolerance;
-- id, created_at and updated_at are not serialized and never bump on their own.

-- ---------------------------------------------------------------------------
-- guard_assessment_year_expectation_source_revision
-- Serialized fields: template_id, indicator_id, generation_type,
-- year_1..5_expected, year_1..5_expected_unit, tolerance.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_assessment_year_expectation_source_revision()
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
  ELSIF ROW(OLD.template_id, OLD.indicator_id, OLD.generation_type,
            OLD.year_1_expected, OLD.year_1_expected_unit,
            OLD.year_2_expected, OLD.year_2_expected_unit,
            OLD.year_3_expected, OLD.year_3_expected_unit,
            OLD.year_4_expected, OLD.year_4_expected_unit,
            OLD.year_5_expected, OLD.year_5_expected_unit,
            OLD.tolerance)
        IS DISTINCT FROM
        ROW(NEW.template_id, NEW.indicator_id, NEW.generation_type,
            NEW.year_1_expected, NEW.year_1_expected_unit,
            NEW.year_2_expected, NEW.year_2_expected_unit,
            NEW.year_3_expected, NEW.year_3_expected_unit,
            NEW.year_4_expected, NEW.year_4_expected_unit,
            NEW.year_5_expected, NEW.year_5_expected_unit,
            NEW.tolerance)
  THEN
    PERFORM public.bump_template_source_revisions(ARRAY[OLD.template_id, NEW.template_id]);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.guard_assessment_year_expectation_source_revision() IS
  'PROC-B5 F4 owner-only source guard for assessment_year_expectations. Bumps direct template_id parents. No API grants.';

REVOKE ALL ON FUNCTION public.guard_assessment_year_expectation_source_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER assessment_year_expectations_source_revision_guard
AFTER INSERT OR UPDATE OR DELETE ON public.assessment_year_expectations
FOR EACH ROW
EXECUTE FUNCTION public.guard_assessment_year_expectation_source_revision();

COMMENT ON TRIGGER assessment_year_expectations_source_revision_guard ON public.assessment_year_expectations IS
  'PROC-B5 F4: bumps template source revision on year expectation insert/delete and serialized field changes.';
