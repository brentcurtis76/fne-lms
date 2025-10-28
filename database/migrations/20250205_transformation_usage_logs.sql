-- 20250205_transformation_usage_logs.sql
-- Registra uso del LLM y habilita rate limiting por usuario

BEGIN;

CREATE TABLE IF NOT EXISTS public.transformation_llm_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    assessment_id uuid NOT NULL REFERENCES public.transformation_assessments (id) ON DELETE CASCADE,
    model text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    latency_ms integer,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.transformation_llm_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_llm_usage" ON public.transformation_llm_usage;
CREATE POLICY "user_read_llm_usage"
    ON public.transformation_llm_usage
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_insert_llm_usage" ON public.transformation_llm_usage;
CREATE POLICY "user_insert_llm_usage"
    ON public.transformation_llm_usage
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_delete_llm_usage" ON public.transformation_llm_usage;
CREATE POLICY "user_delete_llm_usage"
    ON public.transformation_llm_usage
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_transformation_llm_usage_user_created_at
    ON public.transformation_llm_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transformation_llm_usage_assessment
    ON public.transformation_llm_usage (assessment_id, created_at DESC);

COMMIT;
