-- ============================================================
-- Migration: Add detalle_options column to assessment_indicators
--
-- Purpose:
--   Supports the new "Detalle" indicator category — a follow-up
--   multiple-choice indicator (pick all that apply) that appears
--   after a cobertura gate opens. Purely descriptive with no
--   scoring impact.
--
-- Changes:
--   1. Add detalle_options JSONB DEFAULT NULL to assessment_indicators
--   2. Update category check constraint to include 'detalle'
--
-- Storage format:
--   detalle_options stores a JSON array of option label strings.
--   Example: ["ABP", "Cajas de Aprendizaje", "Gamificación"]
--   Only populated when category = 'detalle'. NULL for all other
--   categories. Existing rows remain NULL (no backfill needed).
--
-- RLS: No changes. assessment_indicators already has RLS enabled
--   with existing policies covering all category values.
--
-- Rollback plan:
--   ALTER TABLE assessment_indicators DROP COLUMN IF EXISTS detalle_options;
--   ALTER TABLE assessment_indicators DROP CONSTRAINT IF EXISTS assessment_indicators_category_check;
--   ALTER TABLE assessment_indicators ADD CONSTRAINT assessment_indicators_category_check
--     CHECK (category = ANY (ARRAY['cobertura'::text, 'frecuencia'::text, 'profundidad'::text, 'traspaso'::text]));
-- ============================================================

-- 1. Add detalle_options column (additive, nullable, no backfill needed)
ALTER TABLE assessment_indicators
  ADD COLUMN IF NOT EXISTS detalle_options JSONB DEFAULT NULL;

COMMENT ON COLUMN assessment_indicators.detalle_options IS
  'JSON array of option label strings for detalle-category indicators. '
  'Example: ["ABP", "Cajas de Aprendizaje", "Gamificación"]. '
  'Only populated when category = ''detalle''. NULL for all other categories. '
  'Detalle responses are stored in assessment_indicator_responses.sub_responses '
  'as { "selected_options": ["ABP", "Gamificación"] }.';

-- 2. Update the category check constraint to include 'detalle'
--    The previous migration (20260305100000) left the constraint as:
--    CHECK (category = ANY (ARRAY['cobertura', 'frecuencia', 'profundidad', 'traspaso']))
ALTER TABLE assessment_indicators
  DROP CONSTRAINT IF EXISTS assessment_indicators_category_check;

ALTER TABLE assessment_indicators
  ADD CONSTRAINT assessment_indicators_category_check
  CHECK (category = ANY (ARRAY[
    'cobertura'::text,
    'frecuencia'::text,
    'profundidad'::text,
    'traspaso'::text,
    'detalle'::text
  ]));
