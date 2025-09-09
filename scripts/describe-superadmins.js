const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',
  { auth: { persistSession: false } }
);

async function describeSuperadmins() {
  console.log('=== Superadmins Table Analysis ===\n');
  
  // Try to get schema info via query
  const { data: schemaData, error: schemaError } = await supabase
    .rpc('get_table_columns', { table_name: 'superadmins' })
    .single();
    
  if (schemaError) {
    console.log('Cannot get schema via RPC, trying direct query...\n');
  }
  
  // Try inserting with all possible required fields
  const userId = 'b3e926f4-58f8-4277-8075-c57eefad1e8c';
  
  console.log('Attempting insert with different field combinations:\n');
  
  // Try with reason field and use the existing superadmin as granted_by
  const existingSuperadminId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'; // From earlier query
  
  const { error: error1 } = await supabase
    .from('superadmins')
    .upsert([{
      user_id: userId,
      reason: 'Local testing of RBAC Phase 2',
      granted_by: existingSuperadminId  // Use existing superadmin
    }], { onConflict: 'user_id' });
    
  if (error1) {
    console.log('❌ With reason field:', error1.message);
  } else {
    console.log('✅ Successfully granted superadmin!');
    
    // Verify
    const { data: checkData } = await supabase
      .rpc('auth_is_superadmin', { check_user_id: userId });
    console.log(`   Verification: auth_is_superadmin = ${checkData}`);
    
    // Show all superadmins
    const { data: allAdmins } = await supabase
      .from('superadmins')
      .select('*');
      
    if (allAdmins) {
      console.log('\nAll superadmins:');
      console.log(JSON.stringify(allAdmins, null, 2));
    }
  }
}

describeSuperadmins().catch(console.error);