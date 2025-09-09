const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkDatabaseSchema() {
  console.log('Checking database schema...\n');
  
  // Check profiles table columns
  console.log('1. Checking profiles table structure:');
  const { data: profileColumns, error: profileError } = await supabase
    .rpc('get_table_columns', { table_name: 'profiles' })
    .select('*');
    
  if (profileError) {
    // Try alternative method
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(0);
    
    if (!error && data) {
      console.log('Profiles table exists and is accessible');
    } else {
      console.log('Error accessing profiles table:', error);
    }
  } else {
    console.log('Profile columns:', profileColumns);
  }
  
  // Check user_roles table columns
  console.log('\n2. Checking user_roles table structure:');
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('*')
    .limit(0);
    
  if (!roleError) {
    console.log('User_roles table exists and is accessible');
  } else {
    console.log('Error accessing user_roles table:', roleError);
  }
  
  // Try to insert a test profile to see what error we get
  console.log('\n3. Testing profile insert with all potential columns:');
  const testId = 'test-' + Date.now();
  
  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: testId,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      name: 'Test User', // This might not exist
      approval_status: 'approved', // This might not exist
      must_change_password: true // This might not exist
    });
    
  if (insertError) {
    console.log('Full insert error:', insertError.message);
    console.log('Error details:', insertError.details);
    console.log('Error hint:', insertError.hint);
    
    // Now try with minimal columns
    console.log('\n4. Testing profile insert with minimal columns:');
    const { error: minimalError } = await supabase
      .from('profiles')
      .insert({
        id: testId,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User'
      });
      
    if (minimalError) {
      console.log('Minimal insert error:', minimalError.message);
      console.log('Error details:', minimalError.details);
    } else {
      console.log('✅ Minimal insert succeeded!');
      // Clean up
      await supabase.from('profiles').delete().eq('id', testId);
    }
  } else {
    console.log('✅ Full insert succeeded (all columns exist)');
    // Clean up
    await supabase.from('profiles').delete().eq('id', testId);
  }
  
  // Check auth.users trigger or constraint
  console.log('\n5. Checking for auth.users constraints:');
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (!userError) {
    console.log(`Found ${userData.users.length} existing users in auth.users`);
  } else {
    console.log('Error accessing auth.users:', userError);
  }
}

checkDatabaseSchema().catch(console.error);