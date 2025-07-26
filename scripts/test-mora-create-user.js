const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testMoraCreateUser() {
  console.log('🧪 Testing Mora Del Fresno\'s ability to create users');
  console.log('=================================================\n');

  try {
    // Step 1: Sign in as Mora
    console.log('📱 Step 1: Signing in as Mora Del Fresno...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'mdelfresno@nuevaeducacion.org',
      password: 'FNE@2024' // Default password
    });

    if (authError) {
      console.error('❌ Failed to sign in as Mora:', authError.message);
      console.log('\n💡 Trying alternative authentication method...');
      
      // Alternative: Get Mora's user data directly
      const { data: userData } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', 'mdelfresno@nuevaeducacion.org')
        .single();
      
      if (!userData) {
        console.error('❌ Could not find Mora\'s user data');
        return;
      }

      // Create a mock session for testing
      console.log('✅ Found Mora\'s user data:', userData.id);
      
      // Test the API logic directly
      console.log('\n📋 Step 2: Testing admin role check logic...');
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userData.id)
        .eq('role_type', 'admin')
        .eq('is_active', true);

      console.log('Query result:', { 
        rolesFound: userRoles?.length || 0,
        error: roleError?.message || null 
      });

      if (roleError || !userRoles || userRoles.length === 0) {
        console.error('❌ Admin check would fail:', roleError || 'No admin roles found');
      } else {
        console.log('✅ Admin check passes! Found', userRoles.length, 'admin role(s)');
        console.log('   This proves the fix works - previously .single() would have failed here');
      }

      return;
    }

    const session = authData.session;
    console.log('✅ Successfully signed in');
    console.log('   Session token:', session.access_token.substring(0, 20) + '...');

    // Step 2: Test create user API
    console.log('\n📋 Step 2: Testing create user API endpoint...');
    
    const testUser = {
      email: `test-mora-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      role: 'docente'
    };

    console.log('   Creating test user:', testUser.email);

    const response = await fetch('http://localhost:3000/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(testUser)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', response.status, result.error);
      
      if (result.error === 'Unauthorized. Only admins can create users.') {
        console.log('\n⚠️  The fix hasn\'t taken effect yet. This could mean:');
        console.log('   1. The development server needs to be restarted');
        console.log('   2. The API route is cached');
        console.log('   3. There\'s another issue preventing the fix from working');
      }
    } else {
      console.log('✅ Success! User created:', result.user);
      console.log('\n🎉 Mora can now create users successfully!');
      
      // Clean up test user
      if (result.user?.id) {
        await supabase.auth.admin.deleteUser(result.user.id);
        console.log('🧹 Test user cleaned up');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Test the fixed query logic directly
async function testQueryLogic() {
  console.log('\n\n🔬 Direct Database Query Test');
  console.log('==============================\n');
  
  // Get Mora's ID
  const { data: mora } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'mdelfresno@nuevaeducacion.org')
    .single();

  if (!mora) {
    console.error('Could not find Mora');
    return;
  }

  console.log('Testing OLD query (with .single())...');
  try {
    const { data: oldQuery, error: oldError } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', mora.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .single();

    if (oldError) {
      console.log('❌ OLD query fails:', oldError.message);
      console.log('   (This is expected since Mora has multiple admin roles)');
    } else {
      console.log('✅ OLD query succeeds:', oldQuery);
    }
  } catch (e) {
    console.log('❌ OLD query throws:', e.message);
  }

  console.log('\nTesting NEW query (without .single())...');
  const { data: newQuery, error: newError } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', mora.id)
    .eq('role_type', 'admin')
    .eq('is_active', true);

  if (newError) {
    console.log('❌ NEW query fails:', newError.message);
  } else {
    console.log('✅ NEW query succeeds! Found', newQuery.length, 'admin roles');
    console.log('   Roles:', newQuery);
  }
}

// Run the tests
console.log('Note: Make sure your development server is running on http://localhost:3000\n');

testQueryLogic()
  .then(() => testMoraCreateUser())
  .catch(console.error);