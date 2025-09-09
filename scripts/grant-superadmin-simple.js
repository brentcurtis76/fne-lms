const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',
  { auth: { persistSession: false } }
);

async function grantSuperadmin() {
  const userId = 'b3e926f4-58f8-4277-8075-c57eefad1e8c'; // brentcurtis76@gmail.com
  
  console.log('=== Granting Superadmin Status ===');
  console.log('User: brentcurtis76@gmail.com');
  console.log('ID:', userId, '\n');
  
  // Insert just the user_id
  const { data, error } = await supabase
    .from('superadmins')
    .upsert([{ user_id: userId }], { onConflict: 'user_id' });
    
  if (error) {
    console.log('❌ Failed to grant superadmin:', error.message);
    return;
  }
  
  console.log('✅ Successfully inserted into superadmins table');
  
  // Verify
  const { data: checkData, error: checkError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: userId });
    
  if (checkError) {
    console.log('❌ Error verifying:', checkError.message);
  } else {
    console.log(`✅ Verification: auth_is_superadmin = ${checkData}`);
  }
  
  // List all superadmins
  const { data: allAdmins, error: listError } = await supabase
    .from('superadmins')
    .select('*');
    
  if (!listError && allAdmins) {
    console.log('\nCurrent superadmins:', allAdmins.length);
    allAdmins.forEach(admin => {
      console.log(`  - ${admin.user_id} (created: ${admin.created_at})`);
    });
  }
}

grantSuperadmin().catch(console.error);