-- 20250206_transformation_optimize_indices.sql
-- Índices compuestos para historial de conversación

BEGIN;

DROP INDEX IF EXISTS idx_transformation_conversation_messages_assessment;
DROP INDEX IF EXISTS idx_transformation_conversation_messages_rubric;

CREATE INDEX IF NOT EXISTS idx_transformation_conversation_messages_composite
    ON public.transformation_conversation_messages (
      assessment_id,
      rubric_item_id,
      created_at DESC
    );

COMMIT;
