const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkAndApply() {
  console.log('🔧 Checking manual contracts columns...');
  
  // First, let's check if we can read from contratos table
  const { data: sampleContract, error: readError } = await supabase
    .from('contratos')
    .select('*')
    .limit(1);
    
  if (readError) {
    console.error('❌ Error reading contratos table:', readError);
    return;
  }
  
  // Check if columns exist by trying to select them
  const { data: testSelect, error: columnError } = await supabase
    .from('contratos')
    .select('id, es_manual, descripcion_manual')
    .limit(1);
    
  if (columnError && columnError.message.includes('column')) {
    console.log('⚠️ Columns do not exist yet. Please apply the migration via Supabase dashboard:');
    console.log('\nSQL to run:');
    console.log('------------------------');
    console.log(`ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS es_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS descripcion_manual TEXT;`);
    console.log('------------------------');
    console.log('\nGo to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
  } else {
    console.log('✅ Columns already exist or were successfully added!');
    if (testSelect && testSelect[0]) {
      console.log('   Sample data:', {
        es_manual: testSelect[0].es_manual,
        descripcion_manual: testSelect[0].descripcion_manual
      });
    }
  }
}

checkAndApply().catch(console.error);