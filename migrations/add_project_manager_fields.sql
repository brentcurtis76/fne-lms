-- Migración: Agregar campos del Encargado del Proyecto a la tabla clientes
-- Fecha: 2025-06-03
-- Descripción: Agrega nombre, teléfono y email del encargado del proyecto para gestión de facturación

-- Agregar los nuevos campos a la tabla clientes
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS nombre_encargado_proyecto TEXT,
ADD COLUMN IF NOT EXISTS telefono_encargado_proyecto TEXT,
ADD COLUMN IF NOT EXISTS email_encargado_proyecto TEXT;

-- Comentarios para documentar los campos
COMMENT ON COLUMN clientes.nombre_encargado_proyecto IS 'Nombre del encargado del proyecto del colegio';
COMMENT ON COLUMN clientes.telefono_encargado_proyecto IS 'Teléfono de contacto del encargado del proyecto';
COMMENT ON COLUMN clientes.email_encargado_proyecto IS 'Email de contacto del encargado del proyecto';

-- Opcional: Agregar índice en el email si será usado para búsquedas
CREATE INDEX IF NOT EXISTS idx_clientes_email_encargado ON clientes(email_encargado_proyecto);