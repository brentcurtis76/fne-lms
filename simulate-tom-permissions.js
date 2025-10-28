const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

const tomId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';

async function simulateTomLogin() {
  console.log('=== SIMULATING TOM\'S PERMISSION CALCULATION ===\n');

  // Step 1: Get Tom's active roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role_type, school_id, community_id, is_active')
    .eq('user_id', tomId)
    .eq('is_active', true);

  console.log('1. TOM\'S ACTIVE ROLES:');
  console.log(JSON.stringify(userRoles, null, 2));
  console.log();

  if (!userRoles || userRoles.length === 0) {
    console.log('ERROR: Tom has NO active roles!');
    return;
  }

  // Step 2: Get permissions for those roles
  const roleTypes = userRoles.map(r => r.role_type);
  console.log('2. FETCHING PERMISSIONS FOR ROLES:', roleTypes);
  console.log();

  const { data: rolePermissions } = await supabase
    .from('role_permissions')
    .select('permission_key, granted, role_type')
    .in('role_type', roleTypes)
    .eq('is_test', false)
    .eq('active', true);

  console.log('3. PERMISSIONS FOUND:', rolePermissions?.length || 0);
  console.log();

  // Step 3: Build permission map
  const permMap = {};
  rolePermissions?.forEach(perm => {
    if (perm.granted) {
      permMap[perm.permission_key] = true;
    } else if (!(perm.permission_key in permMap)) {
      permMap[perm.permission_key] = false;
    }
  });

  console.log('4. PERMISSION MAP:');
  console.log('   Total permissions:', Object.keys(permMap).length);
  console.log('   Granted permissions:', Object.values(permMap).filter(v => v === true).length);
  console.log();

  // Step 4: Check reporting permissions specifically
  console.log('5. REPORTING PERMISSIONS FOR TOM:');
  const reportingPerms = ['view_reports_all', 'view_reports_network', 'view_reports_school', 'view_reports_generation', 'view_reports_community'];
  reportingPerms.forEach(perm => {
    console.log('   ', perm, ':', permMap[perm] || false);
  });
  console.log();

  // Step 5: Check if Tom should see Reportes in sidebar
  const hasAnyReportingPerm = reportingPerms.some(p => permMap[p] === true);
  console.log('6. SHOULD TOM SEE REPORTES IN SIDEBAR?', hasAnyReportingPerm);
  console.log();

  // Step 6: Get Tom's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('school, school_id, schools:school_id(id, name)')
    .eq('id', tomId)
    .single();

  console.log('7. TOM\'S PROFILE:');
  console.log('   Old school field:', profile?.school);
  console.log('   School ID:', profile?.school_id);
  console.log('   School from FK:', profile?.schools?.name);
  console.log();

  console.log('=== ROOT CAUSE ANALYSIS ===\n');
  console.log('ISSUE 1: Profile Card Organization');
  console.log('  - Card displays: profile.school (old text field)');
  console.log('  - Current value: "' + profile?.school + '"');
  console.log('  - Should display: School name from school_id FK');
  console.log('  - Correct value: "' + (profile?.schools?.name || 'N/A') + '"');
  console.log();

  console.log('ISSUE 2: Sidebar Reporting Access');
  console.log('  - Tom has role: equipo_directivo');
  console.log('  - equipo_directivo has view_reports_school: true');
  console.log('  - Tom should see Reportes: ' + hasAnyReportingPerm);
  console.log('  - Tom actually sees Reportes: ' + hasAnyReportingPerm);
  console.log();

  if (hasAnyReportingPerm) {
    console.log('✓ SIDEBAR IS WORKING CORRECTLY');
  } else {
    console.log('✗ SIDEBAR ISSUE - Tom should see Reportes but doesn\'t have permission');
  }
}

simulateTomLogin().catch(console.error);
