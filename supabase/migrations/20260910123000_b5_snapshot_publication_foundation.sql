-- PROC-B5 F0: dormant per-template source revision counter.
-- Storage and read primitive only. Future owner-level guard triggers bump the
-- counter; no API caller (including service_role) may write it. An absent row
-- means revision 0 until a future guard initializes it. No backfill.

CREATE TABLE public.assessment_template_source_revisions (
  template_id UUID PRIMARY KEY
    REFERENCES public.assessment_templates(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0
    CONSTRAINT assessment_template_source_revisions_revision_nonnegative
    CHECK (revision >= 0)
);

ALTER TABLE public.assessment_template_source_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.assessment_template_source_revisions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.assessment_template_source_revisions
  TO authenticated, service_role;

-- service_role reads through BYPASSRLS; authenticated needs an active admin
-- role and a satisfied password change gate.
CREATE POLICY assessment_template_source_revisions_admin_select
  ON public.assessment_template_source_revisions
  FOR SELECT
  TO authenticated
  USING (public.auth_is_assessment_admin() AND public.password_change_gate_ok());

SELECT public.apply_forced_password_change_guard('public', 'assessment_template_source_revisions');

CREATE FUNCTION public.get_template_source_revision(p_template_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_revision BIGINT;
BEGIN
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  -- Refuse explicitly so RLS-hidden rows never read as revision 0.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (public.auth_is_assessment_admin() AND public.password_change_gate_ok()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT r.revision
    INTO v_revision
    FROM public.assessment_template_source_revisions r
   WHERE r.template_id = p_template_id;

  -- Template existence is validated later by publication, not here.
  RETURN COALESCE(v_revision, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_template_source_revision(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_template_source_revision(UUID)
  TO authenticated, service_role;
