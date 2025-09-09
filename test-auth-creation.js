const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testUserCreation() {
  console.log('Testing user creation process...\n');
  
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  
  console.log('1. Creating user via Supabase Auth Admin API:');
  console.log('   Email:', testEmail);
  
  try {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        role: 'docente'
      }
    });
    
    if (createError) {
      console.log('❌ Auth creation failed:', createError.message);
      console.log('Error details:', createError);
      
      // Check if it's a trigger/function error
      if (createError.message.includes('trigger') || createError.message.includes('function')) {
        console.log('\n⚠️  This appears to be a database trigger or function error');
        console.log('There might be a trigger on auth.users that expects certain columns in profiles');
      }
      
      return;
    }
    
    console.log('✅ User created in auth.users');
    console.log('   User ID:', newUser.user.id);
    
    // Now try to create profile
    console.log('\n2. Creating profile for the user:');
    
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: newUser.user.id,
        email: testEmail,
        first_name: 'Test',
        last_name: 'User'
      });
      
    if (profileError) {
      console.log('❌ Profile creation failed:', profileError.message);
      console.log('Error details:', profileError);
    } else {
      console.log('✅ Profile created successfully');
    }
    
    // Try to create user role
    console.log('\n3. Creating user role:');
    
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role_type: 'docente',
        created_at: new Date().toISOString()
      });
      
    if (roleError) {
      console.log('❌ Role creation failed:', roleError.message);
      console.log('Error details:', roleError);
    } else {
      console.log('✅ Role created successfully');
    }
    
    // Clean up - delete the test user
    console.log('\n4. Cleaning up test user...');
    const { error: deleteError } = await supabase.auth.admin.deleteUser(newUser.user.id);
    
    if (deleteError) {
      console.log('⚠️  Could not delete test user:', deleteError.message);
    } else {
      console.log('✅ Test user deleted');
    }
    
  } catch (error) {
    console.log('Unexpected error:', error);
  }
}

testUserCreation().catch(console.error);