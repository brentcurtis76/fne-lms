const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function verifyFix() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

  console.log('=== Verification Report for brent@perrotuertocm.cl ===\n');

  // 1. Check active roles
  console.log('1. Active Roles:');
  const { data: activeRoles } = await supabase
    .from('user_roles')
    .select('role_type, community_id, school_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('role_type');

  activeRoles.forEach(role => {
    const scope = role.community_id
      ? '(community-scoped)'
      : role.school_id
        ? '(school-scoped)'
        : '(GLOBAL)';
    console.log(`   ✅ ${role.role_type} ${scope}`);
  });

  // 2. Simulate getUserPrimaryRole logic
  console.log('\n2. Primary Role (what UI sees via getUserPrimaryRole):');
  const roleOrder = [
    'admin',
    'consultor',
    'equipo_directivo',
    'lider_generacion',
    'lider_comunidad',
    'supervisor_de_red',
    'community_manager',
    'docente'
  ];

  let primaryRole = null;
  for (const roleType of roleOrder) {
    if (activeRoles.some(r => r.role_type === roleType)) {
      primaryRole = roleType;
      break;
    }
  }

  console.log(`   Primary role: ${primaryRole || 'NONE'}`);

  // 3. Check UI access permission
  console.log('\n3. UI Access Check:');
  const hasUIAccess = ['admin', 'equipo_directivo', 'consultor'].includes(primaryRole);
  if (hasUIAccess) {
    console.log('   ✅ PASS - User will have UI access to assignment page');
  } else {
    console.log('   ❌ FAIL - User will be blocked by UI permission check');
  }

  // 4. Check API permission (hasManagePermission)
  console.log('\n4. API Permission Check (hasManagePermission):');
  const { data: apiPermCheck } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role_type', ['admin', 'equipo_directivo', 'consultor']);

  if (apiPermCheck && apiPermCheck.length > 0) {
    console.log('   ✅ PASS - API will allow assignment operations');
  } else {
    console.log('   ❌ FAIL - API will reject assignment operations');
  }

  // 5. Check user_roles_cache (for fallback scenarios)
  console.log('\n5. user_roles_cache Status:');
  const { data: cacheData } = await supabase
    .from('user_roles_cache')
    .select('role')
    .eq('user_id', userId);

  if (cacheData && cacheData.length > 0) {
    const uniqueRoles = [...new Set(cacheData.map(r => r.role))];
    console.log(`   Cache contains: ${uniqueRoles.join(', ')}`);
  } else {
    console.log('   ⚠️  Cache is empty or outdated');
  }

  // 6. Final verdict
  console.log('\n=== FINAL VERDICT ===');
  if (hasUIAccess && apiPermCheck && apiPermCheck.length > 0) {
    console.log('✅ FIXED - User should now be able to assign learning paths');
    console.log('\nNext steps:');
    console.log('1. Have user log out and log back in (to refresh session)');
    console.log('2. Navigate to: /admin/learning-paths');
    console.log('3. Click "Asignar" on any learning path');
    console.log('4. Assignment interface should load successfully');
  } else {
    console.log('❌ ISSUE REMAINS - User still cannot assign learning paths');
    console.log('\nRemaining problems:');
    if (!hasUIAccess) {
      console.log('- UI access check fails (getUserPrimaryRole issue)');
    }
    if (!apiPermCheck || apiPermCheck.length === 0) {
      console.log('- API permission check fails (hasManagePermission issue)');
    }
  }
}

verifyFix().catch(console.error);
