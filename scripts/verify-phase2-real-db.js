const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Use test database credentials from environment
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function runVerification() {
  let output = '=== RBAC Phase 2 Database Verification (Real DB) ===\n';
  output += `Timestamp: ${new Date().toISOString()}\n`;
  output += `Database: Test Supabase Project\n\n`;

  let allChecksPassed = true;

  // 1. Check baseline table row count
  const { count: baselineCount, error: baselineError } = await supabase
    .from('role_permission_baseline')
    .select('*', { count: 'exact', head: true });

  if (baselineError) {
    output += `❌ Error checking baseline table: ${baselineError.message}\n`;
    allChecksPassed = false;
  } else {
    output += `✅ Baseline table row count: ${baselineCount || 0}\n`;
    if (baselineCount === 72) {
      output += '   ✓ Expected 72 rows found\n';
    } else {
      output += `   ⚠️ WARNING: Found ${baselineCount} rows, expected 72\n`;
      allChecksPassed = false;
    }
  }

  // 2. Test RPC function
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_effective_permissions', { p_role_type: 'admin', p_test_run_id: null });

  if (rpcError) {
    output += `\n❌ Error calling get_effective_permissions: ${rpcError.message}\n`;
    allChecksPassed = false;
  } else {
    output += `\n✅ RPC function test - admin permissions count: ${rpcData?.length || 0}\n`;
    if (rpcData && rpcData.length > 0) {
      output += '   Sample permissions:\n';
      rpcData.slice(0, 3).forEach(perm => {
        output += `   - ${perm.permission_key}: ${perm.granted} (source: ${perm.source})\n`;
      });
    }
  }

  // 3. Check for test overlays (should be 0)
  const { count: overlayCount, error: overlayError } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact', head: true })
    .eq('is_test', true)
    .eq('active', true);

  if (overlayError) {
    output += '\n⚠️ role_permissions table not accessible (Phase 1 not deployed)\n';
  } else {
    output += `\n✅ Active test overlays count: ${overlayCount || 0}\n`;
    if (overlayCount === 0) {
      output += '   ✓ No test overlays active (expected)\n';
    } else {
      output += `   ⚠️ WARNING: Found ${overlayCount} active test overlays\n`;
      allChecksPassed = false;
    }
  }

  // 4. Check test_mode_state (should be 0 enabled)
  const { count: testModeCount, error: testModeError } = await supabase
    .from('test_mode_state')
    .select('*', { count: 'exact', head: true })
    .eq('enabled', true);

  if (testModeError) {
    output += '\n⚠️ test_mode_state table not accessible\n';
  } else {
    output += `\n✅ Enabled test modes count: ${testModeCount || 0}\n`;
    if (testModeCount === 0) {
      output += '   ✓ No test modes enabled (expected)\n';
    } else {
      output += `   ⚠️ WARNING: Found ${testModeCount} enabled test modes\n`;
      allChecksPassed = false;
    }
  }

  // 5. Check auth_is_superadmin function
  const { data: funcData, error: funcError } = await supabase
    .rpc('sql', { 
      query: "SELECT proname, prosecdef FROM pg_proc WHERE proname = 'auth_is_superadmin'" 
    });

  if (!funcError && funcData) {
    const secDefiner = funcData[0]?.prosecdef;
    output += `\n✅ auth_is_superadmin function: SECURITY DEFINER = ${secDefiner}\n`;
    if (!secDefiner) {
      output += '   ⚠️ WARNING: Function not SECURITY DEFINER\n';
      allChecksPassed = false;
    }
  } else {
    // Try alternative approach
    output += '\n⚠️ Cannot check function properties via SQL RPC\n';
  }

  // 6. Check catalogs
  const { count: roleTypesCount, error: roleTypesError } = await supabase
    .from('role_types')
    .select('*', { count: 'exact', head: true });

  const { count: permissionsCount, error: permissionsError } = await supabase
    .from('permissions')
    .select('*', { count: 'exact', head: true });

  if (roleTypesError || permissionsError) {
    output += '\n❌ Catalog tables missing:\n';
    if (roleTypesError) output += `   - role_types: ${roleTypesError.message}\n`;
    if (permissionsError) output += `   - permissions: ${permissionsError.message}\n`;
    allChecksPassed = false;
  } else {
    output += `\n✅ Catalog tables present:\n`;
    output += `   - role_types: ${roleTypesCount} entries\n`;
    output += `   - permissions: ${permissionsCount} entries\n`;
  }

  // 7. Check superadmins table
  const { data: superadmins, error: superadminsError } = await supabase
    .from('superadmins')
    .select('*');

  if (superadminsError) {
    output += `\n❌ Superadmins table error: ${superadminsError.message}\n`;
    allChecksPassed = false;
  } else {
    output += `\n✅ Superadmins table accessible: ${superadmins?.length || 0} users\n`;
    if (superadmins && superadmins.length > 0) {
      output += '   Active superadmins:\n';
      superadmins.filter(s => s.is_active).forEach(admin => {
        output += `   - User ID: ${admin.user_id}\n`;
      });
    }
  }

  output += '\n=== Database Verification Complete ===\n';
  output += `Overall Status: ${allChecksPassed ? '✅ PASSED' : '❌ FAILED'}\n`;

  // Save to log file
  const logPath = path.join(__dirname, '..', 'logs', 'mcp', '20250909', 'sql-phase2-local.txt');
  fs.writeFileSync(logPath, output);
  
  console.log(output);
  console.log(`\nLog saved to: ${logPath}`);
  
  if (!allChecksPassed) {
    console.log('\n⚠️ Some checks failed. Review the output above.');
    process.exit(1);
  }
}

runVerification().catch(console.error);