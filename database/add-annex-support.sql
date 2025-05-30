-- Add annex support to contratos table
-- This allows contracts to be marked as annexes with reference to parent contracts

-- Add fields for annex support
ALTER TABLE contratos 
ADD COLUMN is_anexo BOOLEAN DEFAULT FALSE;

ALTER TABLE contratos 
ADD COLUMN parent_contrato_id UUID REFERENCES contratos(id);

ALTER TABLE contratos 
ADD COLUMN anexo_numero INTEGER;

ALTER TABLE contratos 
ADD COLUMN anexo_fecha DATE;

ALTER TABLE contratos 
ADD COLUMN numero_participantes INTEGER;

ALTER TABLE contratos 
ADD COLUMN nombre_ciclo VARCHAR(50) CHECK (nombre_ciclo IN ('Primer Ciclo', 'Segundo Ciclo', 'Tercer Ciclo'));

-- Add index for efficient parent contract queries
CREATE INDEX idx_contratos_parent_id ON contratos(parent_contrato_id);

-- Add index for annex queries
CREATE INDEX idx_contratos_is_anexo ON contratos(is_anexo);

-- Add comments for documentation
COMMENT ON COLUMN contratos.is_anexo IS 'Indicates if this contract is an annex to another contract';
COMMENT ON COLUMN contratos.parent_contrato_id IS 'References the parent contract if this is an annex';
COMMENT ON COLUMN contratos.anexo_numero IS 'Sequential annex number for the parent contract (1, 2, 3...)';
COMMENT ON COLUMN contratos.anexo_fecha IS 'Date of the annex creation';
COMMENT ON COLUMN contratos.numero_participantes IS 'Number of participants for the annex';
COMMENT ON COLUMN contratos.nombre_ciclo IS 'Cycle name: Primer Ciclo, Segundo Ciclo, or Tercer Ciclo';

-- Ensure annex number is unique per parent contract
CREATE UNIQUE INDEX idx_unique_anexo_per_parent 
ON contratos(parent_contrato_id, anexo_numero) 
WHERE is_anexo = TRUE;