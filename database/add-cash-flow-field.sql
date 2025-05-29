-- Add incluir_en_flujo field to contratos table
-- This field determines whether a contract should be included in cash flow calculations

ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS incluir_en_flujo BOOLEAN DEFAULT FALSE;

-- Update existing contracts to be included in cash flow by default
UPDATE contratos 
SET incluir_en_flujo = TRUE 
WHERE incluir_en_flujo IS NULL;

-- Add comment to explain the field
COMMENT ON COLUMN contratos.incluir_en_flujo IS 'Indicates whether this contract should be included in cash flow reports and calculations';