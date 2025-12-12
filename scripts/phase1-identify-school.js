const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== PHASE 1: SCHOOL & USER IDENTIFICATION ===\n');

  // Step 1: Find school
  console.log('Step 1: Finding school...');
  const { data: schools, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .or('name.ilike.%William Taylor%,name.ilike.%Metodista%');

  if (schoolError) {
    console.error('Error:', schoolError);
    process.exit(1);
  }

  if (!schools || schools.length === 0) {
    console.log('❌ No school found matching "William Taylor" or "Metodista"');
    process.exit(0);
  }

  console.log(`✅ Found ${schools.length} school(s):`);
  schools.forEach(s => console.log(`   - ${s.name} (ID: ${s.id})`));

  if (schools.length > 1) {
    console.log('\n⚠️  Multiple schools found. Using first match for user count.');
  }

  const schoolId = schools[0].id;
  const schoolName = schools[0].name;
  console.log(`\nUsing: ${schoolName} (ID: ${schoolId})\n`);

  // Step 2: Get users via user_roles
  console.log('Step 2: Getting users from user_roles...');
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('school_id', schoolId);

  if (rolesError) {
    console.error('Error:', rolesError);
    process.exit(1);
  }

  const userRoleIds = new Set((userRoles || []).map(ur => ur.user_id));
  console.log(`   Found ${userRoleIds.size} users via user_roles`);

  // Step 3: Get users via profiles.school_id (fallback)
  console.log('\nStep 3: Getting users from profiles.school_id...');
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId);

  if (profileError) {
    console.error('Error:', profileError);
    process.exit(1);
  }

  const profileIds = new Set((profiles || []).map(p => p.id));
  console.log(`   Found ${profileIds.size} users via profiles.school_id`);

  // Step 4: Combine (UNION)
  const allUserIds = new Set([...userRoleIds, ...profileIds]);

  console.log(`\n=== RESULTS ===`);
  console.log(`School: ${schoolName}`);
  console.log(`School ID: ${schoolId}`);
  console.log(`Total Unique Users: ${allUserIds.size}`);
  console.log(`  - Via user_roles: ${userRoleIds.size}`);
  console.log(`  - Via profiles.school_id: ${profileIds.size}`);

  // Check for discrepancies
  const onlyInRoles = [...userRoleIds].filter(id => !profileIds.has(id));
  const onlyInProfiles = [...profileIds].filter(id => !userRoleIds.has(id));

  if (onlyInRoles.length > 0) {
    console.log(`\n⚠️  ${onlyInRoles.length} users found ONLY in user_roles (not in profiles.school_id)`);
  }
  if (onlyInProfiles.length > 0) {
    console.log(`\n⚠️  ${onlyInProfiles.length} users found ONLY in profiles.school_id (not in user_roles)`);
  }

  // Output for Phase 2
  console.log(`\n✅ Phase 1 Complete. Ready for Phase 2 diagnostics.`);
  console.log(`\nSchool ID to use: ${schoolId}`);
  console.log(`Total users to analyze: ${allUserIds.size}`);

  process.exit(0);
})();
