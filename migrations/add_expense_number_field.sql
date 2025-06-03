-- Migración: Agregar campo de número de gasto/factura/boleta a expense_items
-- Fecha: 2025-06-03
-- Descripción: Agrega campo para almacenar el número de factura, boleta o recibo

-- Agregar el nuevo campo a la tabla expense_items
ALTER TABLE expense_items 
ADD COLUMN IF NOT EXISTS expense_number TEXT;

-- Comentario para documentar el campo
COMMENT ON COLUMN expense_items.expense_number IS 'Número de factura, boleta o recibo del gasto';

-- Índice para búsquedas por número de gasto
CREATE INDEX IF NOT EXISTS idx_expense_items_expense_number ON expense_items(expense_number);

-- Verificación de la migración
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'expense_items' 
AND column_name = 'expense_number';