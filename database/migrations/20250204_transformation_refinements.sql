-- 20250204_transformation_refinements.sql
-- Ajustes de estabilidad para Vías de Transformación

BEGIN;

------------------------------------------------------------------------------
-- Constraint: garantizar claves semánticas estables para la rúbrica
------------------------------------------------------------------------------

ALTER TABLE public.transformation_rubric
    DROP CONSTRAINT IF EXISTS transformation_rubric_area_display_order_key;

ALTER TABLE public.transformation_rubric
    ADD CONSTRAINT transformation_rubric_semantic_key
    UNIQUE (area, objective_number, action_number, dimension);

------------------------------------------------------------------------------
-- Función de ayuda para Row Level Security
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_transformation_access(community_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  jwt_claims := auth.jwt();

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND (
        ur.role_type IN ('admin', 'consultor')
        OR ur.community_id = community_uuid
      )
  ) THEN
    RETURN true;
  END IF;

  IF jwt_claims IS NOT NULL
     AND jwt_claims ? 'user_metadata'
     AND jwt_claims->'user_metadata' ? 'roles'
     AND jsonb_typeof(jwt_claims->'user_metadata'->'roles') = 'array' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(jwt_claims->'user_metadata'->'roles') role
      WHERE role IN ('admin', 'consultor')
    );
  END IF;

  RETURN false;
END;
$$;

------------------------------------------------------------------------------
-- Políticas RLS: usar la función y limitar al rol authenticated
------------------------------------------------------------------------------

ALTER TABLE public.transformation_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_transformation_assessments" ON public.transformation_assessments;
CREATE POLICY "members_read_transformation_assessments"
    ON public.transformation_assessments
    FOR SELECT
    TO authenticated
    USING (public.has_transformation_access(transformation_assessments.growth_community_id));

DROP POLICY IF EXISTS "members_insert_transformation_assessments" ON public.transformation_assessments;
CREATE POLICY "members_insert_transformation_assessments"
    ON public.transformation_assessments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_transformation_access(transformation_assessments.growth_community_id)
        AND EXISTS (
            SELECT 1
            FROM public.growth_communities gc
            WHERE gc.id = transformation_assessments.growth_community_id
              AND gc.transformation_enabled = true
        )
    );

DROP POLICY IF EXISTS "members_update_transformation_assessments" ON public.transformation_assessments;
CREATE POLICY "members_update_transformation_assessments"
    ON public.transformation_assessments
    FOR UPDATE
    TO authenticated
    USING (public.has_transformation_access(transformation_assessments.growth_community_id))
    WITH CHECK (
        public.has_transformation_access(transformation_assessments.growth_community_id)
        AND EXISTS (
            SELECT 1
            FROM public.growth_communities gc
            WHERE gc.id = transformation_assessments.growth_community_id
              AND gc.transformation_enabled = true
        )
    );

ALTER TABLE public.transformation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_transformation_results" ON public.transformation_results;
CREATE POLICY "members_read_transformation_results"
    ON public.transformation_results
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_results.assessment_id
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

DROP POLICY IF EXISTS "members_insert_transformation_results" ON public.transformation_results;
CREATE POLICY "members_insert_transformation_results"
    ON public.transformation_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            JOIN public.growth_communities gc ON gc.id = ta.growth_community_id
            WHERE ta.id = transformation_results.assessment_id
              AND gc.transformation_enabled = true
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

DROP POLICY IF EXISTS "members_update_transformation_results" ON public.transformation_results;
CREATE POLICY "members_update_transformation_results"
    ON public.transformation_results
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_results.assessment_id
              AND public.has_transformation_access(ta.growth_community_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            JOIN public.growth_communities gc ON gc.id = ta.growth_community_id
            WHERE ta.id = transformation_results.assessment_id
              AND gc.transformation_enabled = true
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

DROP POLICY IF EXISTS "members_delete_transformation_results" ON public.transformation_results;
CREATE POLICY "members_delete_transformation_results"
    ON public.transformation_results
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_results.assessment_id
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

COMMIT;
