const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',
  { auth: { persistSession: false } }
);

async function checkSchema() {
  console.log('=== Checking Superadmin Table Schema ===\n');
  
  // Check current superadmins
  const { data, error } = await supabase
    .from('superadmins')
    .select('*');
    
  if (error) {
    console.log('❌ Error querying superadmins:', error.message);
  } else {
    console.log('✅ Superadmins table exists');
    console.log('   Current rows:', data.length);
    if (data.length > 0) {
      console.log('\n   Existing superadmins:');
      data.forEach(row => {
        console.log(`   - User ID: ${row.user_id}`);
        console.log(`     Email: ${row.email || 'N/A'}`);
        console.log(`     Created: ${row.created_at}`);
      });
    }
  }
  
  // Try simplified insert
  const userId = 'b3e926f4-58f8-4277-8075-c57eefad1e8c';
  const email = 'brentcurtis76@gmail.com';
  
  console.log('\n=== Attempting to grant superadmin ===');
  const { data: insertData, error: insertError } = await supabase
    .from('superadmins')
    .upsert([
      {
        user_id: userId,
        email: email
      }
    ], { onConflict: 'user_id' });
    
  if (insertError) {
    console.log('❌ Failed to insert:', insertError.message);
  } else {
    console.log('✅ Successfully granted superadmin to:', email);
  }
  
  // Verify
  const { data: checkData, error: checkError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: userId });
    
  console.log('\n=== Verification ===');
  if (checkError) {
    console.log('❌ Error checking status:', checkError.message);
  } else {
    console.log(`✅ auth_is_superadmin(${email}) = ${checkData}`);
  }
}

checkSchema().catch(console.error);