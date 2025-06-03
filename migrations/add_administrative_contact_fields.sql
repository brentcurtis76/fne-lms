-- Migración: Agregar campos del Contacto Administrativo a la tabla clientes
-- Fecha: 2025-06-03
-- Descripción: Agrega nombre, teléfono y email del contacto administrativo para envío de facturas

-- Agregar los nuevos campos a la tabla clientes
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS nombre_contacto_administrativo TEXT,
ADD COLUMN IF NOT EXISTS telefono_contacto_administrativo TEXT,
ADD COLUMN IF NOT EXISTS email_contacto_administrativo TEXT;

-- Comentarios para documentar los campos
COMMENT ON COLUMN clientes.nombre_contacto_administrativo IS 'Nombre del contacto administrativo que recibe facturas';
COMMENT ON COLUMN clientes.telefono_contacto_administrativo IS 'Teléfono del contacto administrativo para facturación';
COMMENT ON COLUMN clientes.email_contacto_administrativo IS 'Email del contacto administrativo donde se envían las facturas';

-- Índice en el email para búsquedas de facturación
CREATE INDEX IF NOT EXISTS idx_clientes_email_administrativo ON clientes(email_contacto_administrativo);

-- Verificación de la migración
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'clientes' 
AND column_name LIKE '%contacto_administrativo%'
ORDER BY column_name;