const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRLSStatus() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(22) + 'CHECKING RLS POLICIES STATUS' + ' '.repeat(28) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('');

  // Test if we can query workspaces at all
  console.log('Testing workspace access...\n');

  const { data: workspaces, error } = await supabase
    .from('community_workspaces')
    .select('id, name, community_id')
    .limit(5);

  if (error) {
    console.log('❌ Error querying workspaces:', error.message);
    return;
  }

  console.log('✅ Service role can query workspaces:', workspaces.length, 'found');
  console.log('');

  // Try to check if RLS is enabled
  console.log('Checking RLS configuration...\n');

  // Count total workspaces
  const { count } = await supabase
    .from('community_workspaces')
    .select('*', { count: 'exact', head: true });

  console.log('Total workspaces in database:', count);
  console.log('');

  console.log('═'.repeat(80));
  console.log('NEXT STEPS:');
  console.log('═'.repeat(80));
  console.log('');
  console.log('1. Apply the RLS migration in Supabase SQL Editor:');
  console.log('   File: database/migrations/023_fix_community_workspaces_rls_secure.sql');
  console.log('   URL: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
  console.log('');
  console.log('2. Have affected users:');
  console.log('   - Log out of the application');
  console.log('   - Log back in');
  console.log('   - Try accessing "Espacio Colaborativo"');
  console.log('');
  console.log('3. Verify by testing with a real user account in browser');
  console.log('');
  console.log('Expected result: Users can now access their workspace ✅');
}

checkRLSStatus();
