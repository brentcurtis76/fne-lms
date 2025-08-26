const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function applyMigration() {
  console.log('🔧 Applying manual contracts migration...');
  
  // Check if columns already exist
  const { data: existingColumns, error: checkError } = await supabase
    .rpc('execute_sql', { 
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'contratos' 
        AND column_name IN ('es_manual', 'descripcion_manual');
      `
    });

  if (checkError) {
    console.error('❌ Error checking existing columns:', checkError);
    return;
  }

  const existingColumnNames = existingColumns?.map(row => row.column_name) || [];
  
  if (existingColumnNames.includes('es_manual') && existingColumnNames.includes('descripcion_manual')) {
    console.log('✅ Columns already exist, migration not needed');
    return;
  }

  // Apply migration
  const migration = `
    ALTER TABLE contratos 
    ADD COLUMN IF NOT EXISTS es_manual BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS descripcion_manual TEXT;
  `;

  const { error } = await supabase.rpc('execute_sql', { query: migration });

  if (error) {
    console.error('❌ Migration failed:', error);
  } else {
    console.log('✅ Migration applied successfully!');
    console.log('   - Added es_manual column (BOOLEAN)');
    console.log('   - Added descripcion_manual column (TEXT)');
  }
}

applyMigration().catch(console.error);