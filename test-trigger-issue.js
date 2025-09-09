const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testTriggerIssue() {
  console.log('Testing what happens when auth.users is created...\n');
  
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  
  console.log('1. Creating user with fields that might be expected by trigger:');
  console.log('   Email:', testEmail);
  
  try {
    // Try with additional metadata that might be expected
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        role: 'docente',
        first_name: 'Test',
        last_name: 'User',
        name: 'Test User',
        approval_status: 'approved',
        must_change_password: true
      }
    });
    
    if (createError) {
      console.log('❌ Auth creation failed:', createError.message);
      console.log('Full error:', JSON.stringify(createError, null, 2));
      
      // Try to understand what's causing the error
      if (createError.message.includes('column')) {
        const match = createError.message.match(/column "(\w+)"/);
        if (match) {
          console.log(`\n⚠️  The trigger is trying to access column: ${match[1]}`);
          console.log('This column does not exist in the profiles table!');
        }
      }
      
      return;
    }
    
    console.log('✅ User created in auth.users');
    console.log('   User ID:', newUser.user.id);
    
    // Check if profile was auto-created by trigger
    console.log('\n2. Checking if profile was auto-created:');
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', newUser.user.id)
      .single();
      
    if (profile) {
      console.log('✅ Profile was auto-created by trigger');
      console.log('Profile data:', JSON.stringify(profile, null, 2));
    } else if (profileError) {
      console.log('❌ No profile found:', profileError.message);
    }
    
    // Clean up
    console.log('\n3. Cleaning up test user...');
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

testTriggerIssue().catch(console.error);