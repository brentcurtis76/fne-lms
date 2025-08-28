const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// For now, let's just test if the system works without the groups table
// The QuoteFormV2 can work in single-group mode until the migration is applied

async function testQuoteSystem() {
  console.log('Testing quote system without groups table...');
  
  // Test that pasantias_quotes table exists
  const { data: quotes, error } = await supabase
    .from('pasantias_quotes')
    .select('id')
    .limit(1);
    
  if (!error) {
    console.log('✅ pasantias_quotes table exists and is accessible');
  } else {
    console.log('❌ Error accessing pasantias_quotes:', error.message);
  }
  
  // Test programs
  const { data: programs, error: programError } = await supabase
    .from('pasantias_programs')
    .select('*');
    
  if (!programError) {
    console.log('✅ pasantias_programs table has', programs.length, 'programs');
    programs.forEach(p => {
      console.log(`  - ${p.name}: $${p.price.toLocaleString('es-CL')} CLP`);
    });
  }
  
  console.log('\n📝 Note: The groups feature requires running the migration in Supabase dashboard');
  console.log('   File: database/migrations/add_quote_groups.sql');
  console.log('   Until then, the system will work in single-group mode');
}

testQuoteSystem();