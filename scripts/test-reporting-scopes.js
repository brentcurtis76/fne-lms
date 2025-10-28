/**
 * Test Scoped Reporting Permissions
 *
 * Verifies that:
 * 1. Equipo Directivo can view reports for their school
 * 2. Community Manager has NO reporting access
 * 3. Lider Generación can view reports for their generation
 * 4. Lider Comunidad can view reports for their community
 * 5. Supervisor de Red can view reports for their network
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function testReportingScopes() {
  console.log('🧪 TESTING SCOPED REPORTING PERMISSIONS\n');
  console.log('=' .repeat(80) + '\n');

  let totalTests = 0;
  let passedTests = 0;

  function test(name, condition, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ ${name}`);
      if (details) console.log(`   ${details}`);
    } else {
      console.log(`❌ ${name}`);
      if (details) console.log(`   ${details}`);
    }
  }

  // Test 1: Equipo Directivo - School Scope
  console.log('TEST 1: Equipo Directivo - School Reporting\n');

  const { data: equipoReports } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'equipo_directivo')
    .like('permission_key', '%view_reports%')
    .eq('is_test', false);

  const hasSchoolReports = equipoReports.find(p => p.permission_key === 'view_reports_school' && p.granted);
  const hasAllReports = equipoReports.find(p => p.permission_key === 'view_reports_all' && p.granted);
  const hasGenerationReports = equipoReports.find(p => p.permission_key === 'view_reports_generation' && p.granted);
  const hasCommunityReports = equipoReports.find(p => p.permission_key === 'view_reports_community' && p.granted);

  test('Equipo Directivo has view_reports_school', !!hasSchoolReports, 'Can view school-level reports');
  test('Equipo Directivo does NOT have view_reports_all', !hasAllReports, 'Correctly restricted from all reports');
  test('Equipo Directivo does NOT have view_reports_generation', !hasGenerationReports, 'No generation access');
  test('Equipo Directivo does NOT have view_reports_community', !hasCommunityReports, 'No community access');
  console.log('');

  // Test 2: Community Manager - NO Reporting
  console.log('TEST 2: Community Manager - NO Reporting Access\n');

  const { data: cmReports } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .like('permission_key', '%view_reports%')
    .eq('granted', true)
    .eq('is_test', false);

  test('Community Manager has NO reporting permissions', cmReports.length === 0,
       `Found ${cmReports.length} reporting permissions (should be 0)`);
  console.log('');

  // Test 3: Lider Generación - Generation Scope
  console.log('TEST 3: Lider Generación - Generation Reporting\n');

  const { data: liderGenReports } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'lider_generacion')
    .like('permission_key', '%view_reports%')
    .eq('is_test', false);

  const hasGenReports = liderGenReports.find(p => p.permission_key === 'view_reports_generation' && p.granted);
  const hasGenAllReports = liderGenReports.find(p => p.permission_key === 'view_reports_all' && p.granted);
  const hasGenSchoolReports = liderGenReports.find(p => p.permission_key === 'view_reports_school' && p.granted);

  test('Lider Generación has view_reports_generation', !!hasGenReports, 'Can view generation-level reports');
  test('Lider Generación does NOT have view_reports_all', !hasGenAllReports, 'Correctly restricted from all reports');
  test('Lider Generación does NOT have view_reports_school', !hasGenSchoolReports, 'No school-wide access');
  console.log('');

  // Test 4: Lider Comunidad - Community Scope
  console.log('TEST 4: Lider Comunidad - Community Reporting\n');

  const { data: liderComReports } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'lider_comunidad')
    .like('permission_key', '%view_reports%')
    .eq('is_test', false);

  const hasComReports = liderComReports.find(p => p.permission_key === 'view_reports_community' && p.granted);
  const hasComAllReports = liderComReports.find(p => p.permission_key === 'view_reports_all' && p.granted);
  const hasComSchoolReports = liderComReports.find(p => p.permission_key === 'view_reports_school' && p.granted);

  test('Lider Comunidad has view_reports_community', !!hasComReports, 'Can view community-level reports');
  test('Lider Comunidad does NOT have view_reports_all', !hasComAllReports, 'Correctly restricted from all reports');
  test('Lider Comunidad does NOT have view_reports_school', !hasComSchoolReports, 'No school-wide access');
  console.log('');

  // Test 5: Supervisor de Red - Network Scope
  console.log('TEST 5: Supervisor de Red - Network Reporting\n');

  const { data: supervisorReports } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'supervisor_de_red')
    .like('permission_key', '%view_reports%')
    .eq('is_test', false);

  const hasNetworkReports = supervisorReports.find(p => p.permission_key === 'view_reports_network' && p.granted);
  const hasSuperAllReports = supervisorReports.find(p => p.permission_key === 'view_reports_all' && p.granted);

  test('Supervisor de Red has view_reports_network', !!hasNetworkReports, 'Can view network-level reports');
  test('Supervisor de Red does NOT have view_reports_all', !hasSuperAllReports, 'Correctly restricted from all reports');
  console.log('');

  // Test 6: Admin - All Reporting
  console.log('TEST 6: Admin - All Reporting Access\n');

  const { data: adminReports } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'admin')
    .like('permission_key', '%view_reports%')
    .eq('granted', true)
    .eq('is_test', false);

  test('Admin has ALL reporting permissions', adminReports.length === 5,
       `Has ${adminReports.length}/5 scoped view_reports permissions`);
  console.log('');

  // Test 7: Verify all scope variants exist
  console.log('TEST 7: All Reporting Scope Variants Exist\n');

  const { data: allReportPerms } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .like('permission_key', '%view_reports%')
    .eq('is_test', false)
    .limit(1000);

  const uniqueReportPerms = [...new Set(allReportPerms.map(p => p.permission_key))];
  const expectedScopes = ['school', 'generation', 'community', 'network', 'all'];

  console.log('   Available view_reports scopes:');
  for (const scope of expectedScopes) {
    const permKey = `view_reports_${scope}`;
    const exists = uniqueReportPerms.includes(permKey);
    test(`  - view_reports_${scope} exists`, exists);
  }
  console.log('');

  // Final Summary
  console.log('=' .repeat(80));
  console.log(`\n📊 TEST RESULTS: ${passedTests}/${totalTests} tests passed\n`);

  if (passedTests === totalTests) {
    console.log('✅ ALL REPORTING SCOPE TESTS PASSED!\n');
    console.log('   Summary:');
    console.log('   ✅ Equipo Directivo: School-level reporting only');
    console.log('   ✅ Community Manager: NO reporting access');
    console.log('   ✅ Lider Generación: Generation-level reporting only');
    console.log('   ✅ Lider Comunidad: Community-level reporting only');
    console.log('   ✅ Supervisor de Red: Network-level reporting only');
    console.log('   ✅ Admin: All reporting scopes\n');
  } else {
    console.log(`⚠️  ${totalTests - passedTests} TEST(S) FAILED\n`);
  }

  console.log('=' .repeat(80) + '\n');
}

testReportingScopes()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
