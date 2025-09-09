const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Production database credentials from .env.local
const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI',
  { auth: { persistSession: false } }
);

async function runVerification() {
  let output = '=== RBAC Phase 2 Database Verification ===\n';
  output += `Timestamp: ${new Date().toISOString()}\n\n`;

  // 1. Check baseline table row count
  const { count: baselineCount, error: baselineError } = await supabase
    .from('role_permission_baseline')
    .select('*', { count: 'exact', head: true });

  if (baselineError) {
    output += `❌ Error checking baseline table: ${baselineError.message}\n`;
  } else {
    output += `✅ Baseline table row count: ${baselineCount || 0}\n`;
    if (baselineCount === 72) {
      output += '   ✓ Expected 72 rows found\n';
    } else {
      output += `   ⚠️ WARNING: Found ${baselineCount} rows, expected 72\n`;
    }
  }

  // 2. Sample baseline permissions
  const { data: sampleBaseline, error: sampleError } = await supabase
    .from('role_permission_baseline')
    .select('role_type, permission_key, granted, metadata')
    .in('role_type', ['admin', 'docente'])
    .limit(10)
    .order('role_type')
    .order('permission_key');

  if (sampleError) {
    output += `❌ Error fetching sample baseline: ${sampleError.message}\n`;
  } else {
    output += '\n✅ Sample baseline permissions:\n';
    sampleBaseline?.forEach(row => {
      output += `   ${row.role_type}: ${row.permission_key} = ${row.granted}\n`;
    });
  }

  // 3. Test RPC function
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_effective_permissions', { p_role_type: 'admin', p_test_run_id: null });

  if (rpcError) {
    output += `\n❌ Error calling get_effective_permissions: ${rpcError.message}\n`;
  } else {
    output += `\n✅ RPC function test - admin permissions count: ${rpcData?.length || 0}\n`;
    if (rpcData && rpcData.length > 0) {
      output += '   Sample permissions:\n';
      rpcData.slice(0, 5).forEach(perm => {
        output += `   - ${perm.permission_key}: ${perm.granted} (source: ${perm.source})\n`;
      });
    }
  }

  // 4. Check for test overlays (should be 0)
  const { count: overlayCount, error: overlayError } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact', head: true })
    .eq('is_test', true)
    .eq('active', true);

  if (overlayError) {
    // Table might not exist if Phase 1 not deployed
    output += '\n⚠️ role_permissions table not accessible (Phase 1 not deployed)\n';
  } else {
    output += `\n✅ Active test overlays count: ${overlayCount || 0}\n`;
    if (overlayCount === 0) {
      output += '   ✓ No test overlays active (expected)\n';
    } else {
      output += `   ⚠️ WARNING: Found ${overlayCount} active test overlays\n`;
    }
  }

  // 5. Check test_mode_state (should be 0 enabled)
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
    }
  }

  // 6. Check auth_is_superadmin function
  const { data: superadminCheck, error: superadminError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: 'b3e926f4-58f8-4277-8075-c57eefad1e8c' }); // brentcurtis76@gmail.com

  if (superadminError) {
    output += `\n❌ Error checking auth_is_superadmin: ${superadminError.message}\n`;
  } else {
    output += `\n✅ Superadmin function exists\n`;
    output += `   Check for brentcurtis76@gmail.com: ${superadminCheck}\n`;
  }

  output += '\n=== Database Verification Complete ===\n';

  // Save to log file
  const logPath = path.join(__dirname, '..', 'logs', 'mcp', '20250909', 'sql-phase2-local.txt');
  fs.writeFileSync(logPath, output);
  
  console.log(output);
  console.log(`\nLog saved to: ${logPath}`);
}

runVerification().catch(console.error);