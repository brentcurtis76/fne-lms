const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testUserRolesColumns() {
  console.log('Testing user_roles table columns...\n');
  
  // Get a sample user ID
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);
    
  if (!profiles || profiles.length === 0) {
    console.log('No profiles found to test with');
    return;
  }
  
  const testUserId = profiles[0].id;
  console.log('Using test user ID:', testUserId);
  
  // Try inserting with all potential columns
  console.log('\n1. Testing user_roles insert with all potential columns:');
  
  const { error: fullError } = await supabase
    .from('user_roles')
    .insert({
      user_id: testUserId,
      role_type: 'docente',
      is_active: true,
      created_at: new Date().toISOString(),
      assigned_by: testUserId  // This might not exist
    });
    
  if (fullError) {
    console.log('Full insert error:', fullError.message);
    
    if (fullError.message.includes('column')) {
      const match = fullError.message.match(/column "(\w+)"/);
      if (match) {
        console.log(`⚠️  Column "${match[1]}" does not exist`);
      }
    }
    
    // Now try with minimal columns
    console.log('\n2. Testing user_roles insert with minimal columns:');
    const { error: minimalError } = await supabase
      .from('user_roles')
      .insert({
        user_id: testUserId,
        role_type: 'estudiante',  // Use different role to avoid duplicate
        created_at: new Date().toISOString()
      });
      
    if (minimalError) {
      console.log('Minimal insert error:', minimalError.message);
      
      // Try without created_at
      console.log('\n3. Testing without created_at:');
      const { error: noDateError } = await supabase
        .from('user_roles')
        .insert({
          user_id: testUserId,
          role_type: 'supervisor_de_red'  // Different role
        });
        
      if (noDateError) {
        console.log('No date error:', noDateError.message);
      } else {
        console.log('✅ Insert succeeded without created_at');
        // Clean up
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', testUserId)
          .eq('role_type', 'supervisor_de_red');
      }
    } else {
      console.log('✅ Minimal insert succeeded with created_at');
      // Clean up
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', testUserId)
        .eq('role_type', 'estudiante');
    }
  } else {
    console.log('✅ Full insert succeeded (all columns exist)');
    // Clean up
    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', testUserId)
      .eq('role_type', 'docente');
  }
  
  // Check what columns exist by selecting
  console.log('\n4. Checking actual columns by selecting:');
  const { data: roleData, error: selectError } = await supabase
    .from('user_roles')
    .select('*')
    .limit(1);
    
  if (roleData && roleData.length > 0) {
    console.log('Columns found:', Object.keys(roleData[0]));
  }
}

testUserRolesColumns().catch(console.error);