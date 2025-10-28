const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

const tomId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';

async function checkProductionState() {
  console.log('=== PRODUCTION STATE CHECK FOR TOM ===\n');

  // 1. Get Tom's auth metadata
  const { data: authUser } = await supabase.auth.admin.getUserById(tomId);

  console.log('1. AUTH.USERS METADATA:');
  console.log('   Roles in metadata:', authUser?.user?.user_metadata?.roles || 'NONE');
  console.log('   Role (singular):', authUser?.user?.user_metadata?.role || 'NONE');
  console.log();

  // 2. Get active roles from user_roles table
  const { data: activeRoles } = await supabase
    .from('user_roles')
    .select('role_type, school_id, is_active')
    .eq('user_id', tomId)
    .eq('is_active', true);

  console.log('2. ACTIVE ROLES IN DATABASE:');
  console.log(JSON.stringify(activeRoles, null, 2));
  console.log();

  // 3. Get permissions for those roles
  if (activeRoles && activeRoles.length > 0) {
    const roleTypes = activeRoles.map(r => r.role_type);

    const { data: permissions } = await supabase
      .from('role_permissions')
      .select('permission_key, granted, role_type')
      .in('role_type', roleTypes)
      .eq('is_test', false)
      .eq('active', true);

    console.log('3. PERMISSIONS FROM ROLE_PERMISSIONS TABLE:');
    console.log('   Total permissions:', permissions?.length || 0);

    const reportingPerms = permissions?.filter(p => p.permission_key.includes('report')) || [];
    console.log('   Reporting permissions:', reportingPerms.length);
    console.log();

    const grantedReporting = reportingPerms.filter(p => p.granted);
    console.log('4. GRANTED REPORTING PERMISSIONS:');
    if (grantedReporting.length > 0) {
      grantedReporting.forEach(p => {
        console.log('   ✓', p.permission_key, '(from role:', p.role_type + ')');
      });
    } else {
      console.log('   NONE');
    }
    console.log();

    // 5. Check specific permissions needed for sidebar
    const sidebarReportingPerms = [
      'view_reports_all',
      'view_reports_network',
      'view_reports_school',
      'view_reports_generation',
      'view_reports_community'
    ];

    console.log('5. SIDEBAR REPORTING PERMISSION CHECK:');
    const permMap = {};
    permissions?.forEach(p => {
      if (p.granted) {
        permMap[p.permission_key] = true;
      } else if (permMap[p.permission_key] === undefined) {
        permMap[p.permission_key] = false;
      }
    });

    let hasAny = false;
    sidebarReportingPerms.forEach(perm => {
      const has = permMap[perm] === true;
      console.log('   ', perm + ':', has ? '✓ TRUE' : '✗ false');
      if (has) hasAny = true;
    });
    console.log();

    console.log('6. SHOULD SEE REPORTES IN SIDEBAR?', hasAny ? '✓ YES' : '✗ NO');
    console.log();

    if (!hasAny) {
      console.log('❌ ROOT CAUSE: Tom does NOT have any of the required reporting permissions!');
      console.log();
      console.log('CHECKING WHY...');
      console.log();

      // Check if permissions exist but are not granted
      const reportSchoolPerm = permissions?.find(p => p.permission_key === 'view_reports_school');
      if (reportSchoolPerm) {
        console.log('view_reports_school permission found:');
        console.log('  Role:', reportSchoolPerm.role_type);
        console.log('  Granted:', reportSchoolPerm.granted);
        console.log();
        console.log('THE PERMISSION EXISTS BUT IS SET TO granted=false!');
        console.log('This needs to be updated in the role_permissions table.');
      } else {
        console.log('view_reports_school permission NOT FOUND in role_permissions table!');
        console.log('The permission needs to be added for role: equipo_directivo');
      }
    } else {
      console.log('✓ Tom has the correct permissions. Issue is likely:');
      console.log('  - Stale localStorage cache');
      console.log('  - User needs to log out and back in');
    }
  } else {
    console.log('❌ NO ACTIVE ROLES FOUND!');
  }
}

checkProductionState().catch(console.error);
