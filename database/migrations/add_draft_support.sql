-- Add support for draft contracts with partial data

-- 1. Allow programa_id to be NULL for drafts and manual contracts
ALTER TABLE contratos ALTER COLUMN programa_id DROP NOT NULL;

-- 2. Add estado column if it doesn't exist (default to 'pendiente' for existing contracts)
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contratos' AND column_name = 'estado'
  ) THEN
    ALTER TABLE contratos ADD COLUMN estado TEXT DEFAULT 'pendiente';
    
    -- Add check constraint for valid estados
    ALTER TABLE contratos ADD CONSTRAINT contratos_estado_check 
      CHECK (estado IN ('borrador', 'pendiente', 'activo', 'finalizado'));
    
    -- Update existing contracts to have proper estado
    UPDATE contratos SET estado = 'activo' WHERE fecha_fin > CURRENT_DATE;
    UPDATE contratos SET estado = 'finalizado' WHERE fecha_fin <= CURRENT_DATE;
    
    COMMENT ON COLUMN contratos.estado IS 'Estado del contrato: borrador (draft), pendiente (pending approval), activo (active), finalizado (finished)';
  END IF;
END $$;

-- 3. Allow other fields to be NULL for drafts
ALTER TABLE contratos ALTER COLUMN fecha_fin DROP NOT NULL;
ALTER TABLE contratos ALTER COLUMN precio_total_uf SET DEFAULT 0;

-- 4. Create index for faster draft queries
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos(estado);
CREATE INDEX IF NOT EXISTS idx_contratos_numero_estado ON contratos(numero_contrato, estado);

-- Comments for documentation
COMMENT ON COLUMN contratos.programa_id IS 'ID del programa (puede ser NULL para contratos manuales o borradores)';
COMMENT ON COLUMN contratos.fecha_fin IS 'Fecha de fin del contrato (puede ser NULL para borradores)';