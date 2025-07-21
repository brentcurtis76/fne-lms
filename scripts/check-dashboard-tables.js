const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkDashboardTables() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found');
    process.exit(1);
  }

  console.log('🔍 Checking dashboard-related tables...\n');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Check schools
    const { count: schoolCount, error: schoolError } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true });
    
    if (schoolError) {
      console.error('Error checking schools:', schoolError.message);
    } else {
      console.log(`📚 Schools: ${schoolCount} records`);
    }
    
    // Check profiles
    const { count: profileCount, error: profileError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (profileError) {
      console.error('Error checking profiles:', profileError.message);
    } else {
      console.log(`👤 Profiles: ${profileCount} records`);
    }
    
    // Check user_roles
    const { count: roleCount, error: roleError } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true });
    
    if (roleError) {
      console.error('Error checking user_roles:', roleError.message);
    } else {
      console.log(`🎭 User Roles: ${roleCount} records`);
    }
    
    // Check learning paths
    const { count: pathCount, error: pathError } = await supabase
      .from('learning_paths')
      .select('*', { count: 'exact', head: true });
    
    if (pathError) {
      console.error('Error checking learning_paths:', pathError.message);
    } else {
      console.log(`🛤️  Learning Paths: ${pathCount} records`);
    }
    
    // Check if Brent's profile exists
    console.log('\n🔍 Checking Brent\'s profile...');
    const { data: brentProfile, error: brentError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, school, approval_status')
      .eq('id', '4ae17b21-8977-425c-b05a-ca7cdb8b9df5')
      .single();
    
    if (brentError) {
      console.error('Error fetching Brent\'s profile:', brentError.message);
    } else if (brentProfile) {
      console.log('✅ Brent\'s profile found:');
      console.log(JSON.stringify(brentProfile, null, 2));
    } else {
      console.log('❌ Brent\'s profile not found');
    }
    
    // Check if Brent has admin role
    console.log('\n🔍 Checking Brent\'s admin role...');
    const { data: brentRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', '4ae17b21-8977-425c-b05a-ca7cdb8b9df5');
    
    if (rolesError) {
      console.error('Error fetching Brent\'s roles:', rolesError.message);
    } else if (brentRoles && brentRoles.length > 0) {
      console.log('✅ Brent\'s roles found:');
      console.log(JSON.stringify(brentRoles, null, 2));
    } else {
      console.log('❌ No roles found for Brent');
    }
    
    // Let's also check a few sample schools
    console.log('\n🏫 Sample schools:');
    const { data: sampleSchools, error: sampleSchoolsError } = await supabase
      .from('schools')
      .select('id, name')
      .limit(5);
    
    if (sampleSchoolsError) {
      console.error('Error fetching sample schools:', sampleSchoolsError.message);
    } else if (sampleSchools && sampleSchools.length > 0) {
      sampleSchools.forEach(school => {
        console.log(`  - ${school.name} (ID: ${school.id})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDashboardTables();