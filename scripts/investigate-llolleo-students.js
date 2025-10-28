const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  console.log('🔍 INVESTIGATING LLOLLEO STUDENTS\n');
  console.log('═'.repeat(70));

  // Get school
  const { data: school } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%llolleo%')
    .single();

  console.log(`School: ${school.name} (ID: ${school.id})\n`);

  // Check ALL user_roles for Llolleo (not just cache)
  const { data: allRoles } = await supabase
    .from('user_roles')
    .select('user_id, role_type, is_active')
    .eq('school_id', school.id);

  console.log(`Total user_roles for Llolleo: ${allRoles.length}`);

  const roleCounts = {};
  allRoles.forEach(r => { roleCounts[r.role_type] = (roleCounts[r.role_type] || 0) + 1; });
  console.log('\nBreakdown:');
  Object.entries(roleCounts).forEach(([role, count]) => {
    console.log(`   ${role}: ${count}`);
  });

  // Check specifically for students in user_roles
  const students = allRoles.filter(r => r.is_active === true);
  console.log(`\nActive roles: ${students.length}`);

  // Check if students in profiles
  const studentUserIds = allRoles.map(r => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, approval_status')
    .in('id', studentUserIds);

  console.log(`\nProfiles found: ${profiles.length}`);

  const approved = profiles.filter(p => p.approval_status === 'approved');
  console.log(`Approved profiles: ${approved.length}`);

  // THE KEY CHECK: Why are they not in cache?
  console.log('\n═'.repeat(70));
  console.log('CACHE INVESTIGATION:');
  console.log('═'.repeat(70));

  console.log('\nuser_roles_cache is built from:');
  console.log('  WHERE ur.is_active = true');
  console.log('  AND p.approval_status = approved\n');

  const activeAndApproved = allRoles.filter(r => {
    const profile = profiles.find(p => p.id === r.user_id);
    return r.is_active === true && profile && profile.approval_status === 'approved';
  });

  console.log(`Llolleo users that SHOULD be in cache: ${activeAndApproved.length}`);
  console.log(`Llolleo users ACTUALLY in cache: 47`);

  const missing = activeAndApproved.length - 47;
  if (missing > 0) {
    console.log(`\n⚠️  ${missing} Llolleo users are MISSING from cache!`);
  }

  // Check user from screenshot (carla.diazal)
  console.log('\n═'.repeat(70));
  console.log('CHECKING USER FROM SCREENSHOT: carla.diazal');
  console.log('═'.repeat(70));

  const { data: carla } = await supabase
    .from('profiles')
    .select('id, email, approval_status')
    .ilike('email', '%carla.diazal%')
    .single();

  if (carla) {
    console.log(`\nFound: ${carla.email}`);
    console.log(`Approval status: ${carla.approval_status}`);

    const { data: carlaRoles } = await supabase
      .from('user_roles')
      .select('role_type, is_active, school_id')
      .eq('user_id', carla.id);

    console.log(`\nRoles (${carlaRoles.length}):`);
    carlaRoles.forEach(r => {
      console.log(`   ${r.role_type} (active: ${r.is_active}, school: ${r.school_id})`);
    });

    const { data: carlaCache } = await supabase
      .from('user_roles_cache')
      .select('*')
      .eq('user_id', carla.id);

    console.log(`\nIn cache: ${carlaCache ? carlaCache.length : 0} rows`);

    if (!carlaCache || carlaCache.length === 0) {
      console.log('\n🚨 CARLA IS NOT IN THE CACHE!');
      console.log('   Reason check:');
      console.log(`   - Approved? ${carla.approval_status === 'approved' ? 'YES' : 'NO'}`);
      console.log(`   - Active role? ${carlaRoles.some(r => r.is_active) ? 'YES' : 'NO'}`);
    }
  } else {
    console.log('\n⚠️  Carla not found');
  }

  console.log('\n═'.repeat(70));
}

investigate().catch(console.error);
