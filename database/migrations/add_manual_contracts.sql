-- Add support for manual contracts (external contracts uploaded for operational tracking)
ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS es_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS descripcion_manual TEXT;

-- Add comment for documentation
COMMENT ON COLUMN contratos.es_manual IS 'Indicates if this is a manually uploaded external contract';
COMMENT ON COLUMN contratos.descripcion_manual IS 'Brief description of what the manual contract covers';