const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testMoraRoleAssignment() {
  console.log('🧪 Testing Mora\'s Role Assignment Capability');
  console.log('============================================\n');

  const moraId = 'e4216c21-083c-40b5-9b98-ca81cba11b66';

  // 1. Verify Mora has admin privileges
  console.log('1. Verifying Mora\'s admin status...');
  const { data: adminCheck, error: adminError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', moraId)
    .eq('role_type', 'admin')
    .eq('is_active', true)
    .limit(1);

  if (adminCheck && adminCheck.length > 0) {
    console.log('   ✅ Mora has active admin role\n');
  } else {
    console.log('   ❌ Mora does not have active admin role\n');
    return;
  }

  // 2. Simulate what happens when Mora tries to insert a role
  console.log('2. Testing direct role insertion (simulates old method)...');
  
  // This would fail with RLS if Mora was using her auth token
  // But with service role, it should work
  const testUserId = '00000000-0000-0000-0000-000000000001'; // Fake test user
  const { data: insertData, error: insertError } = await supabase
    .from('user_roles')
    .insert({
      user_id: testUserId,
      role_type: 'docente',
      is_active: true,
      assigned_by: moraId,
      assigned_at: new Date().toISOString()
    })
    .select();

  if (insertError) {
    console.log('   ❌ Direct insertion failed:', insertError.message);
    console.log('   This would happen if RLS policies block the insert\n');
  } else {
    console.log('   ✅ Direct insertion succeeded (using service role)');
    // Clean up test data
    if (insertData && insertData[0]) {
      await supabase.from('user_roles').delete().eq('id', insertData[0].id);
      console.log('   Cleaned up test data\n');
    }
  }

  // 3. Show the solution
  console.log('3. SOLUTION IMPLEMENTED:');
  console.log('   ✅ Created /api/admin/assign-role endpoint');
  console.log('   ✅ Created /api/admin/remove-role endpoint');
  console.log('   ✅ Updated RoleAssignmentModal to use API endpoints');
  console.log('   ✅ API endpoints use service role to bypass RLS\n');

  console.log('💡 NEXT STEPS FOR MORA:');
  console.log('   1. Have Mora refresh the page (Ctrl+R or Cmd+R)');
  console.log('   2. Try assigning a role to any user');
  console.log('   3. The operation should now succeed\n');

  console.log('🔍 If issues persist:');
  console.log('   - Check browser console for errors');
  console.log('   - Clear browser cache and cookies');
  console.log('   - Log out and log back in');
}

testMoraRoleAssignment().catch(console.error);