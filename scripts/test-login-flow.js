const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUserLogin(email) {
  try {
    console.log(`\nTesting login flow for ${email}...`);
    console.log('=====================================');

    // First check if user exists in auth.users (using service role)
    const serviceSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { users }, error: authError } = await serviceSupabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching users:', authError);
      return;
    }

    const authUser = users.find(u => u.email === email);
    if (!authUser) {
      console.log('❌ User not found in auth.users');
      return;
    }

    console.log(`✓ User found in auth.users with ID: ${authUser.id}`);

    // Check profile using service role (bypasses RLS)
    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError) {
      console.log('❌ Error fetching profile:', profileError);
    } else {
      console.log('✓ Profile found:', {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        approval_status: profile.approval_status
      });
    }

    // Check user roles
    const { data: roles, error: rolesError } = await serviceSupabase
      .from('user_roles')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('is_active', true);

    if (rolesError) {
      console.log('❌ Error fetching roles:', rolesError);
    } else {
      console.log(`✓ Active roles found: ${roles.length}`);
      roles.forEach(role => {
        console.log(`  - ${role.role_type} (school: ${role.school_id}, community: ${role.community_id})`);
      });
    }

    // Test RLS policies
    console.log('\nTesting RLS policies (simulating authenticated user)...');
    
    // Create a client that simulates the authenticated user
    // Note: In a real scenario, this would use the user's JWT token
    console.log('⚠️  Cannot fully test RLS without actual authentication');
    console.log('    Please test login through the web interface');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

async function main() {
  console.log('Login Flow Test Script');
  console.log('======================');

  // Test admin user
  await testUserLogin('brent@perrotuertocm.cl');

  console.log('\n✅ Test completed. Please verify login through the web interface.');
}

main();