ALTER TABLE assessment_indicators
  ADD COLUMN IF NOT EXISTS evaluation_guidance TEXT DEFAULT NULL;
