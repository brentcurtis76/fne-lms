const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJHJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserRolesAccess() {
  console.log('🔍 Checking user_roles table access and RLS\n');

  // First, let's check if we can query the table at all
  const { data: rolesData, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .limit(1);

  if (rolesError) {
    console.log('❌ Error querying user_roles:', rolesError);
  } else {
    console.log('✅ Can query user_roles table with service role');
  }

  // Now let's simulate what happens when Mora tries to insert a role
  console.log('\n📝 Simulating role assignment for Mora...\n');

  const moraId = 'e4216c21-083c-40b5-9b98-ca81cba11b66';
  const testUserId = '123e4567-e89b-12d3-a456-426614174000'; // Fake user ID for testing

  // Check if the assignRole logic would work
  console.log('1. Checking if Mora has admin privileges...');
  const { data: adminCheck, error: adminError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', moraId)
    .eq('role_type', 'admin')
    .eq('is_active', true)
    .limit(1);

  if (adminCheck && adminCheck.length > 0) {
    console.log('   ✅ Mora has active admin role');
  } else {
    console.log('   ❌ No active admin role found for Mora');
  }

  // Let's also check what happens with the actual isGlobalAdmin logic
  console.log('\n2. Testing isGlobalAdmin function logic...');
  
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', moraId)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.log('   ❌ Error in isGlobalAdmin check:', error);
    } else if (data && data.length > 0) {
      console.log('   ✅ isGlobalAdmin would return true');
    } else {
      console.log('   ❌ isGlobalAdmin would return false');
    }
  } catch (error) {
    console.log('   ❌ Exception in isGlobalAdmin:', error);
  }

  // Check for any potential client-side vs server-side differences
  console.log('\n3. Checking for potential auth context issues...');
  console.log('   Note: When using client-side Supabase:');
  console.log('   - The client uses the user\'s JWT token');
  console.log('   - RLS policies are enforced based on auth.uid()');
  console.log('   - If RLS policies check for admin role, they might fail');

  // Let's see if there's an insert policy that might block non-admins
  console.log('\n4. Common RLS patterns that could cause issues:');
  console.log('   - INSERT policy might require: auth.uid() IN (SELECT user_id FROM user_roles WHERE role_type = \'admin\')');
  console.log('   - This creates a chicken-and-egg problem');
  console.log('   - Admin check queries user_roles, but insert into user_roles might also check admin status');

  console.log('\n💡 POTENTIAL SOLUTIONS:');
  console.log('1. Use service role client for role assignments (bypass RLS)');
  console.log('2. Create an API endpoint that uses service role');
  console.log('3. Adjust RLS policies to allow admins to insert');
  console.log('4. Have Mora clear cache and re-login to refresh JWT claims');
}

checkUserRolesAccess().catch(console.error);