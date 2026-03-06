-- Add 'traspaso' to the assessment_indicators category check constraint
ALTER TABLE assessment_indicators DROP CONSTRAINT assessment_indicators_category_check;
ALTER TABLE assessment_indicators ADD CONSTRAINT assessment_indicators_category_check
  CHECK (category = ANY (ARRAY['cobertura'::text, 'frecuencia'::text, 'profundidad'::text, 'traspaso'::text]));
