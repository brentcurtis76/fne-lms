-- Migration: Atomic objective evaluation updates
-- Prevents race conditions when multiple objectives are evaluated concurrently

-- Function to atomically update a single objective evaluation
CREATE OR REPLACE FUNCTION update_objective_evaluation(
  p_assessment_id UUID,
  p_objective_number INTEGER,
  p_evaluation JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_metadata JSONB;
BEGIN
  -- Atomically update only the specific objective evaluation
  -- Uses jsonb_set to ensure concurrent updates don't overwrite each other
  UPDATE transformation_assessments
  SET
    context_metadata = jsonb_set(
      COALESCE(context_metadata, '{}'::jsonb),
      ARRAY['objective_evaluations', p_objective_number::text],
      p_evaluation,
      true  -- create_if_missing = true
    ),
    updated_at = NOW()
  WHERE id = p_assessment_id
  RETURNING context_metadata INTO v_updated_metadata;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment not found: %', p_assessment_id;
  END IF;

  RETURN v_updated_metadata;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_objective_evaluation(UUID, INTEGER, JSONB) TO authenticated;

-- Add evaluation metadata tracking (for audit trail)
-- This allows us to see when each objective was evaluated and by whom
ALTER TABLE transformation_assessments
ADD COLUMN IF NOT EXISTS evaluation_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN transformation_assessments.evaluation_metadata IS 'Tracks evaluation timestamps and users per objective for audit trail';

-- Function to record evaluation metadata
CREATE OR REPLACE FUNCTION record_objective_evaluation_metadata(
  p_assessment_id UUID,
  p_objective_number INTEGER,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE transformation_assessments
  SET evaluation_metadata = jsonb_set(
    COALESCE(evaluation_metadata, '{}'::jsonb),
    ARRAY['objectives', p_objective_number::text],
    jsonb_build_object(
      'evaluated_at', to_jsonb(NOW()),
      'evaluated_by', to_jsonb(p_user_id)
    ),
    true
  )
  WHERE id = p_assessment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_objective_evaluation_metadata(UUID, INTEGER, UUID) TO authenticated;
