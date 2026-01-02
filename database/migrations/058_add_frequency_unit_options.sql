-- ============================================================
-- 058_add_frequency_unit_options.sql
-- Adds frequency unit options for assessment indicators
--
-- Purpose: Allow admins to define which time period options
-- are valid for frequency indicators, and store the selected
-- unit in responses.
--
-- Changes:
-- 1. Add frequency_unit_options to assessment_indicators
-- 2. Add frequency_unit to assessment_responses
-- ============================================================

-- Add frequency_unit_options column to assessment_indicators
-- Stores array of allowed units: ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año']
ALTER TABLE assessment_indicators
ADD COLUMN IF NOT EXISTS frequency_unit_options JSONB DEFAULT '["dia", "semana", "mes", "trimestre", "semestre", "año"]'::jsonb;

-- Add comment explaining the field
COMMENT ON COLUMN assessment_indicators.frequency_unit_options IS
'Array of allowed frequency units for this indicator. Options: dia, semana, mes, trimestre, semestre, año';

-- Add frequency_unit column to assessment_responses
-- Stores the selected unit for frequency responses
ALTER TABLE assessment_responses
ADD COLUMN IF NOT EXISTS frequency_unit TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN assessment_responses.frequency_unit IS
'Selected frequency unit for frequency-type indicators. E.g., semana, mes, trimestre';

-- Update existing frequency responses to have a default unit
-- Only update rows where the indicator is of type 'frecuencia'
UPDATE assessment_responses ar
SET frequency_unit = 'vez'
WHERE ar.frequency_unit IS NULL
AND EXISTS (
  SELECT 1 FROM assessment_indicators ai
  WHERE ai.id = ar.indicator_id
  AND ai.category = 'frecuencia'
);

-- Verify the changes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_indicators'
    AND column_name = 'frequency_unit_options'
  ) THEN
    RAISE NOTICE 'Successfully added frequency_unit_options to assessment_indicators';
  ELSE
    RAISE EXCEPTION 'Failed to add frequency_unit_options column';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_responses'
    AND column_name = 'frequency_unit'
  ) THEN
    RAISE NOTICE 'Successfully added frequency_unit to assessment_responses';
  ELSE
    RAISE EXCEPTION 'Failed to add frequency_unit column';
  END IF;
END;
$$;
