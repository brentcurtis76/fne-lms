-- 20250117_transformation_base_schema.sql
-- Fase 1 – Bases de datos para Vías de Transformación
-- Introduce las tablas de soporte para la evaluación conversacional

BEGIN;

------------------------------------------------------------------------------
-- Tabla: transformation_rubric
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transformation_rubric (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area text NOT NULL,
    objective_number integer NOT NULL,
    objective_text text NOT NULL,
    action_number integer NOT NULL,
    action_text text NOT NULL,
    dimension text NOT NULL CHECK (dimension IN ('cobertura', 'frecuencia', 'profundidad')),
    level_1_descriptor text NOT NULL,
    level_2_descriptor text NOT NULL,
    level_3_descriptor text NOT NULL,
    level_4_descriptor text NOT NULL,
    initial_questions text[] NOT NULL DEFAULT '{}'::text[],
    display_order integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (area, display_order)
);

CREATE INDEX IF NOT EXISTS idx_transformation_rubric_area
    ON public.transformation_rubric (area, display_order);

------------------------------------------------------------------------------
-- Tabla: transformation_assessments
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transformation_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    growth_community_id uuid NOT NULL REFERENCES public.growth_communities(id) ON DELETE CASCADE,
    area text NOT NULL,
    status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
    conversation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    context_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at timestamptz,
    created_by uuid REFERENCES auth.users (id),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transformation_assessments_community
    ON public.transformation_assessments (growth_community_id);

CREATE INDEX IF NOT EXISTS idx_transformation_assessments_status
    ON public.transformation_assessments (status);

------------------------------------------------------------------------------
-- Tabla: transformation_results
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transformation_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id uuid NOT NULL REFERENCES public.transformation_assessments(id) ON DELETE CASCADE,
    rubric_item_id uuid NOT NULL REFERENCES public.transformation_rubric(id) ON DELETE CASCADE,
    determined_level integer NOT NULL CHECK (determined_level BETWEEN 1 AND 4),
    rationale text,
    determined_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by uuid REFERENCES auth.users (id),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (assessment_id, rubric_item_id)
);

CREATE INDEX IF NOT EXISTS idx_transformation_results_assessment
    ON public.transformation_results (assessment_id);

CREATE INDEX IF NOT EXISTS idx_transformation_results_rubric
    ON public.transformation_results (rubric_item_id);

------------------------------------------------------------------------------
-- growth_communities: habilitar feature flag
------------------------------------------------------------------------------

ALTER TABLE public.growth_communities
    ADD COLUMN IF NOT EXISTS transformation_enabled boolean NOT NULL DEFAULT false;

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

-- Rubric: lectura para usuarios autenticados
ALTER TABLE public.transformation_rubric ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_transformation_rubric" ON public.transformation_rubric;
CREATE POLICY "authenticated_read_transformation_rubric"
    ON public.transformation_rubric
    FOR SELECT
    TO authenticated
    USING (true);

-- Assessments: políticas basadas en pertenencia a la comunidad o rol sistémico
ALTER TABLE public.transformation_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_transformation_assessments" ON public.transformation_assessments;
CREATE POLICY "members_read_transformation_assessments"
    ON public.transformation_assessments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.is_active = true
              AND (
                  ur.role_type IN ('admin', 'consultor')
                  OR ur.community_id = transformation_assessments.growth_community_id
              )
        )
    );

DROP POLICY IF EXISTS "members_insert_transformation_assessments" ON public.transformation_assessments;
CREATE POLICY "members_insert_transformation_assessments"
    ON public.transformation_assessments
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.growth_communities gc ON gc.id = transformation_assessments.growth_community_id
            WHERE ur.user_id = auth.uid()
              AND ur.is_active = true
              AND gc.transformation_enabled = true
              AND (
                  ur.role_type IN ('admin', 'consultor')
                  OR ur.community_id = transformation_assessments.growth_community_id
              )
        )
    );

DROP POLICY IF EXISTS "members_update_transformation_assessments" ON public.transformation_assessments;
CREATE POLICY "members_update_transformation_assessments"
    ON public.transformation_assessments
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.is_active = true
              AND (
                  ur.role_type IN ('admin', 'consultor')
                  OR ur.community_id = transformation_assessments.growth_community_id
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.growth_communities gc ON gc.id = transformation_assessments.growth_community_id
            WHERE ur.user_id = auth.uid()
              AND ur.is_active = true
              AND gc.transformation_enabled = true
              AND (
                  ur.role_type IN ('admin', 'consultor')
                  OR ur.community_id = transformation_assessments.growth_community_id
              )
        )
    );

-- Results: lectura y escritura condicionada al assessment
ALTER TABLE public.transformation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_transformation_results" ON public.transformation_results;
CREATE POLICY "members_read_transformation_results"
    ON public.transformation_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_results.assessment_id
              AND EXISTS (
                  SELECT 1
                  FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.is_active = true
                    AND (
                        ur.role_type IN ('admin', 'consultor')
                        OR ur.community_id = ta.growth_community_id
                    )
              )
        )
    );

DROP POLICY IF EXISTS "members_insert_transformation_results" ON public.transformation_results;
CREATE POLICY "members_insert_transformation_results"
    ON public.transformation_results
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            JOIN public.growth_communities gc ON gc.id = ta.growth_community_id
            WHERE ta.id = transformation_results.assessment_id
              AND gc.transformation_enabled = true
              AND EXISTS (
                  SELECT 1
                  FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.is_active = true
                    AND (
                        ur.role_type IN ('admin', 'consultor')
                        OR ur.community_id = ta.growth_community_id
                    )
              )
        )
    );

DROP POLICY IF EXISTS "members_update_transformation_results" ON public.transformation_results;
CREATE POLICY "members_update_transformation_results"
    ON public.transformation_results
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_results.assessment_id
              AND EXISTS (
                  SELECT 1
                  FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.is_active = true
                    AND (
                        ur.role_type IN ('admin', 'consultor')
                        OR ur.community_id = ta.growth_community_id
                    )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            JOIN public.growth_communities gc ON gc.id = ta.growth_community_id
            WHERE ta.id = transformation_results.assessment_id
              AND gc.transformation_enabled = true
              AND EXISTS (
                  SELECT 1
                  FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.is_active = true
                    AND (
                        ur.role_type IN ('admin', 'consultor')
                        OR ur.community_id = ta.growth_community_id
                    )
              )
        )
    );

DROP POLICY IF EXISTS "members_delete_transformation_results" ON public.transformation_results;
CREATE POLICY "members_delete_transformation_results"
    ON public.transformation_results
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_results.assessment_id
              AND EXISTS (
                  SELECT 1
                  FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid()
                    AND ur.is_active = true
                    AND (
                        ur.role_type IN ('admin', 'consultor')
                        OR ur.community_id = ta.growth_community_id
                    )
              )
        )
    );

COMMIT;
