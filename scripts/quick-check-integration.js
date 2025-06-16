const { createClient } = require('@supabase/supabase-js');

// Use hardcoded values for quick check
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkIntegration() {
  console.log('Checking Schools-Clients Integration...\n');

  try {
    // Try to select cliente_id from schools
    const { data: schoolTest, error: schoolError } = await supabase
      .from('schools')
      .select('id, name, cliente_id')
      .limit(5);

    if (schoolError) {
      if (schoolError.message.includes('column')) {
        console.log('❌ Schools table does NOT have cliente_id column');
        console.log('   The integration SQL needs to be applied!');
      } else {
        console.log('Error checking schools:', schoolError.message);
      }
    } else {
      console.log('✓ Schools table has cliente_id column');
      console.log(`  Found ${schoolTest?.length || 0} schools`);
      if (schoolTest && schoolTest.length > 0) {
        const withClients = schoolTest.filter(s => s.cliente_id);
        console.log(`  ${withClients.length} schools have linked clients`);
      }
    }

    console.log('');

    // Try to select school_id from clientes
    const { data: clientTest, error: clientError } = await supabase
      .from('clientes')
      .select('id, nombre_fantasia, school_id')
      .limit(5);

    if (clientError) {
      if (clientError.message.includes('column')) {
        console.log('❌ Clientes table does NOT have school_id column');
        console.log('   The integration SQL needs to be applied!');
      } else {
        console.log('Error checking clientes:', clientError.message);
      }
    } else {
      console.log('✓ Clientes table has school_id column');
      console.log(`  Found ${clientTest?.length || 0} clients`);
      if (clientTest && clientTest.length > 0) {
        const withSchools = clientTest.filter(c => c.school_id);
        console.log(`  ${withSchools.length} clients have linked schools`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkIntegration();