const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrateAddProjectManager() {
  console.log('🚀 Iniciando migración para agregar campos del Encargado del Proyecto...');

  try {
    // Ejecutar la migración SQL
    const { data, error } = await supabase.rpc('execute_sql', {
      sql: `
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
      `
    });

    if (error) {
      console.error('❌ Error en la migración:', error);
      return;
    }

    console.log('✅ Migración completada exitosamente');
    console.log('📋 Campos agregados a la tabla clientes:');
    console.log('   - nombre_encargado_proyecto (TEXT)');
    console.log('   - telefono_encargado_proyecto (TEXT)');
    console.log('   - email_encargado_proyecto (TEXT)');
    console.log('📊 Índice creado: idx_clientes_email_encargado');

    // Verificar que los campos fueron agregados
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'clientes')
      .like('column_name', '%encargado%');

    if (schemaError) {
      console.warn('⚠️  No se pudo verificar el esquema:', schemaError);
    } else {
      console.log('🔍 Verificación del esquema:');
      columns.forEach(col => {
        console.log(`   ✓ ${col.column_name} (${col.data_type})`);
      });
    }

  } catch (error) {
    console.error('💥 Error inesperado durante la migración:', error);
  }
}

// Ejecutar la migración si el script es llamado directamente
if (require.main === module) {
  migrateAddProjectManager().then(() => {
    console.log('🏁 Migración terminada');
    process.exit(0);
  }).catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { migrateAddProjectManager };