const { createClient } = require('@supabase/supabase-js');

// Test with different authentication levels
const supabaseService = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

const supabaseAnon = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'
);

async function testUIQuery() {
  console.log('Testing the EXACT query the UI uses:\n');
  console.log('Query: profiles.select(id, email, first_name, last_name, school, school_id, created_at, approval_status, school_relation:schools!school_id(id, name))');
  console.log('======================================\n');

  // Test 1: Service role (bypasses RLS)
  console.log('1. SERVICE ROLE TEST (bypasses RLS):');
  const { data: serviceData, error: serviceError, count: serviceCount } = await supabaseService
    .from('profiles')
    .select(`
      id, 
      email, 
      first_name, 
      last_name, 
      school,
      school_id,
      created_at, 
      approval_status,
      school_relation:schools!school_id(id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (serviceError) {
    console.log('  ❌ Error:', serviceError.message);
    console.log('  Details:', serviceError.details);
    console.log('  Hint:', serviceError.hint);
  } else {
    console.log(`  ✅ Success! Found ${serviceData.length} users total`);
    const santaMarta = serviceData.filter(u => u.email?.includes('@colegiosantamartavaldivia.cl'));
    console.log(`  ✅ Santa Marta users: ${santaMarta.length}`);
    if (santaMarta.length > 0) {
      console.log('  Sample users:');
      santaMarta.slice(0, 3).forEach(u => {
        console.log(`    - ${u.email} (${u.first_name} ${u.last_name})`);
      });
    }
  }

  // Test 2: Anonymous (respects RLS)
  console.log('\n2. ANONYMOUS USER TEST (respects RLS):');
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('profiles')
    .select(`
      id, 
      email, 
      first_name, 
      last_name, 
      school,
      school_id,
      created_at, 
      approval_status,
      school_relation:schools!school_id(id, name)
    `)
    .order('created_at', { ascending: false });

  if (anonError) {
    console.log('  ❌ Error:', anonError.message);
    console.log('  Details:', anonError.details);
  } else {
    console.log(`  ✅ Found ${anonData.length} users`);
    const santaMarta = anonData.filter(u => u.email?.includes('@colegiosantamartavaldivia.cl'));
    console.log(`  Santa Marta users visible: ${santaMarta.length}`);
  }

  // Test 3: Check as a logged-in admin
  console.log('\n3. SIMULATING LOGGED-IN ADMIN:');
  
  // First, find an admin user
  const { data: adminUser } = await supabaseService
    .from('profiles')
    .select('id, email')
    .eq('email', 'bcurtis@nuevaeducacion.org')
    .single();
    
  if (adminUser) {
    console.log(`  Admin found: ${adminUser.email}`);
    
    // Check admin's role
    const { data: adminRole } = await supabaseService
      .from('user_roles')
      .select('role_type, is_active')
      .eq('user_id', adminUser.id)
      .eq('role_type', 'admin');
      
    console.log(`  Admin roles:`, adminRole);
    
    // Sign in as admin to get a session token
    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: 'bcurtis@nuevaeducacion.org',
      password: 'Test123!' // You'll need to provide the correct password
    });
    
    if (signInError) {
      console.log('  ❌ Could not sign in as admin:', signInError.message);
    } else if (signInData.session) {
      // Create authenticated client
      const supabaseAuth = createClient(
        'https://sxlogxqzmarhqsblxmtj.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E',
        {
          global: {
            headers: {
              Authorization: `Bearer ${signInData.session.access_token}`
            }
          }
        }
      );
      
      const { data: authData, error: authError } = await supabaseAuth
        .from('profiles')
        .select(`
          id, 
          email, 
          first_name, 
          last_name, 
          school,
          school_id,
          created_at, 
          approval_status,
          school_relation:schools!school_id(id, name)
        `)
        .order('created_at', { ascending: false });
        
      if (authError) {
        console.log('  ❌ Error as authenticated admin:', authError.message);
      } else {
        console.log(`  ✅ As authenticated admin, found ${authData.length} users`);
        const santaMarta = authData.filter(u => u.email?.includes('@colegiosantamartavaldivia.cl'));
        console.log(`  ✅ Santa Marta users visible to admin: ${santaMarta.length}`);
      }
      
      // Sign out
      await supabaseAnon.auth.signOut();
    }
  }

  // Test 4: Check RLS policies
  console.log('\n4. CHECKING RLS POLICIES:');
  const { data: policies } = await supabaseService
    .rpc('get_policies_for_table', { table_name: 'profiles' });
    
  if (policies) {
    console.log('  RLS Policies on profiles table:');
    policies.forEach(p => {
      console.log(`    - ${p.policyname}: ${p.cmd} (${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'})`);
      if (p.qual) console.log(`      Condition: ${p.qual.substring(0, 100)}...`);
    });
  }
}

testUIQuery().catch(console.error);