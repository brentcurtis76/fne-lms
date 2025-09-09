const { createClient } = require('@supabase/supabase-js');

// Production database with service role
const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',
  { auth: { persistSession: false } }
);

async function grantSuperadmin() {
  console.log('=== Granting Superadmin Status ===\n');
  
  // Check if superadmins table exists
  const { data: tables, error: tablesError } = await supabase
    .from('superadmins')
    .select('*')
    .limit(1);
    
  if (tablesError) {
    console.log('❌ superadmins table not accessible:', tablesError.message);
    console.log('\nNote: Superadmin functionality requires the superadmins table.');
    console.log('This table should be created by migration 001_bootstrap_superadmin.sql');
    console.log('\nWARNING: The superadmins table does not exist in production.');
    console.log('This is expected - Phase 0 migrations have not been applied to production.');
    return;
  }
  
  // Try to insert brentcurtis76@gmail.com as superadmin
  const userId = 'b3e926f4-58f8-4277-8075-c57eefad1e8c';
  const email = 'brentcurtis76@gmail.com';
  
  const { data, error } = await supabase
    .from('superadmins')
    .upsert([
      {
        user_id: userId,
        email: email,
        created_at: new Date().toISOString(),
        created_by: 'system'
      }
    ], { onConflict: 'user_id' });
    
  if (error) {
    console.log('❌ Failed to grant superadmin:', error.message);
  } else {
    console.log('✅ Superadmin status granted to:', email);
    console.log('   User ID:', userId);
  }
  
  // Verify the grant
  const { data: checkData, error: checkError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: userId });
    
  if (checkError) {
    console.log('\n❌ Error checking superadmin status:', checkError.message);
  } else {
    console.log('\n✅ Verification: auth_is_superadmin =', checkData);
  }
}

grantSuperadmin().catch(console.error);