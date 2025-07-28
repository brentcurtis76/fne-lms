const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchools() {
  console.log('Checking all schools in database...\n');
  
  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .order('id');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Total schools:', schools.length);
  console.log('\nSchools with has_generations = false:');
  schools.filter(s => !s.has_generations).forEach(s => {
    console.log(`  - ID: ${s.id}, Name: ${s.name}`);
  });
  
  console.log('\nSchools with has_generations = true:');
  schools.filter(s => s.has_generations).forEach(s => {
    console.log(`  - ID: ${s.id}, Name: ${s.name}`);
  });
  
  // Check for Colegio Metodista
  const metodista = schools.find(s => s.name.includes('Metodista'));
  if (metodista) {
    console.log('\n✅ Found Colegio Metodista:', metodista);
  } else {
    console.log('\n❌ Colegio Metodista not found. Let\'s check if it exists with a different name...');
    schools.filter(s => s.name.toLowerCase().includes('metodista')).forEach(s => {
      console.log(`  - Possible match: ${s.name} (ID: ${s.id})`);
    });
  }
}

checkSchools().catch(console.error);