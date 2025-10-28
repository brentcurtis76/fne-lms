-- 20250205_transformation_messages.sql
-- Historial detallado de conversaciones y resumen

BEGIN;

CREATE TABLE IF NOT EXISTS public.transformation_conversation_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id uuid NOT NULL REFERENCES public.transformation_assessments (id) ON DELETE CASCADE,
    rubric_item_id uuid NOT NULL REFERENCES public.transformation_rubric (id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transformation_conversation_messages_assessment
    ON public.transformation_conversation_messages (assessment_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_transformation_conversation_messages_rubric
    ON public.transformation_conversation_messages (rubric_item_id, created_at ASC);

ALTER TABLE public.transformation_conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_transformation_conversation_messages" ON public.transformation_conversation_messages;
CREATE POLICY "members_read_transformation_conversation_messages"
    ON public.transformation_conversation_messages
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_conversation_messages.assessment_id
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

DROP POLICY IF EXISTS "members_insert_transformation_conversation_messages" ON public.transformation_conversation_messages;
CREATE POLICY "members_insert_transformation_conversation_messages"
    ON public.transformation_conversation_messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            JOIN public.growth_communities gc ON gc.id = ta.growth_community_id
            WHERE ta.id = transformation_conversation_messages.assessment_id
              AND gc.transformation_enabled = true
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

DROP POLICY IF EXISTS "members_delete_transformation_conversation_messages" ON public.transformation_conversation_messages;
CREATE POLICY "members_delete_transformation_conversation_messages"
    ON public.transformation_conversation_messages
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.transformation_assessments ta
            WHERE ta.id = transformation_conversation_messages.assessment_id
              AND public.has_transformation_access(ta.growth_community_id)
        )
    );

COMMIT;
