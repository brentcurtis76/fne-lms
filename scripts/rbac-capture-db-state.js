/**
 * RBAC Database State Capture
 *
 * Captures the current state of RBAC-related database tables
 * Run BEFORE and AFTER testing to compare changes
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Capture current database state
 */
async function captureState() {
  console.log('📸 Capturing RBAC database state...\n');

  const state = {
    timestamp: new Date().toISOString(),
    environment: 'development',
    tables: {}
  };

  try {
    // 1. Capture role_permissions
    console.log('Capturing role_permissions...');
    const { data: permissions, error: permError } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('is_test', false)
      .eq('active', true)
      .order('role_type', { ascending: true })
      .order('permission_key', { ascending: true });

    if (permError) {
      console.log(`  ⚠️  Error: ${permError.message}`);
      state.tables.role_permissions = { error: permError.message };
    } else {
      console.log(`  ✅ Captured ${permissions.length} permission records`);
      state.tables.role_permissions = {
        count: permissions.length,
        data: permissions,
        summary: summarizePermissions(permissions)
      };
    }

    // 2. Capture permission_audit_log
    console.log('Capturing permission_audit_log...');
    const { data: auditLogs, error: auditError, count: auditCount } = await supabase
      .from('permission_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(100); // Last 100 entries

    if (auditError) {
      console.log(`  ⚠️  Error: ${auditError.message}`);
      state.tables.permission_audit_log = { error: auditError.message };
    } else {
      console.log(`  ✅ Captured ${auditLogs?.length || 0} recent audit log entries (total: ${auditCount})`);
      state.tables.permission_audit_log = {
        total_count: auditCount,
        recent_entries: auditLogs?.length || 0,
        latest: auditLogs || []
      };
    }

    // 3. Capture superadmins
    console.log('Capturing superadmins...');
    const { data: superadmins, error: saError } = await supabase
      .from('superadmins')
      .select('user_id, is_active, granted_at')
      .eq('is_active', true);

    if (saError) {
      console.log(`  ⚠️  Error: ${saError.message}`);
      state.tables.superadmins = { error: saError.message };
    } else {
      console.log(`  ✅ Captured ${superadmins.length} active superadmins`);
      state.tables.superadmins = {
        count: superadmins.length,
        data: superadmins
      };
    }

    // 4. Capture user_roles for test users
    console.log('Capturing test user_roles...');
    const { data: userRoles, error: urError } = await supabase
      .from('user_roles')
      .select('user_id, role_type, active')
      .eq('is_test', true)
      .eq('active', true);

    if (urError) {
      console.log(`  ⚠️  Error: ${urError.message}`);
      state.tables.user_roles_test = { error: urError.message };
    } else {
      console.log(`  ✅ Captured ${userRoles?.length || 0} test user roles`);
      state.tables.user_roles_test = {
        count: userRoles?.length || 0,
        data: userRoles || []
      };
    }

    return state;

  } catch (error) {
    console.error('❌ Error capturing state:', error);
    state.error = error.message;
    return state;
  }
}

/**
 * Summarize permissions by role
 */
function summarizePermissions(permissions) {
  const summary = {};

  permissions.forEach(perm => {
    if (!summary[perm.role_type]) {
      summary[perm.role_type] = {
        total: 0,
        granted: 0,
        denied: 0
      };
    }

    summary[perm.role_type].total++;
    if (perm.granted) {
      summary[perm.role_type].granted++;
    } else {
      summary[perm.role_type].denied++;
    }
  });

  return summary;
}

/**
 * Save state to file
 */
function saveState(state, filename) {
  const outputDir = path.join(__dirname, '..', 'test-results');

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
  console.log(`\n💾 State saved to: ${filepath}`);

  return filepath;
}

/**
 * Compare two states
 */
function compareStates(beforeFile, afterFile) {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 COMPARING DATABASE STATES');
  console.log('='.repeat(60));

  if (!fs.existsSync(beforeFile)) {
    console.log('❌ Before file not found:', beforeFile);
    return;
  }

  if (!fs.existsSync(afterFile)) {
    console.log('❌ After file not found:', afterFile);
    return;
  }

  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));

  console.log(`\nBefore: ${before.timestamp}`);
  console.log(`After:  ${after.timestamp}`);

  // Compare permissions
  console.log('\n📊 PERMISSION CHANGES:');

  const beforePerms = before.tables.role_permissions?.data || [];
  const afterPerms = after.tables.role_permissions?.data || [];

  const changes = [];

  afterPerms.forEach(afterPerm => {
    const beforePerm = beforePerms.find(
      p => p.role_type === afterPerm.role_type &&
           p.permission_key === afterPerm.permission_key
    );

    if (beforePerm && beforePerm.granted !== afterPerm.granted) {
      changes.push({
        role: afterPerm.role_type,
        permission: afterPerm.permission_key,
        from: beforePerm.granted,
        to: afterPerm.granted
      });
    }
  });

  if (changes.length === 0) {
    console.log('✅ No permission changes detected');
  } else {
    console.log(`⚠️  Found ${changes.length} permission change(s):\n`);
    changes.forEach(change => {
      const arrow = change.to ? '✓' : '✗';
      console.log(`  ${change.role}.${change.permission}: ${change.from ? '✓' : '✗'} → ${arrow}`);
    });
  }

  // Compare audit log
  console.log('\n📝 AUDIT LOG CHANGES:');
  const beforeAuditCount = before.tables.permission_audit_log?.total_count || 0;
  const afterAuditCount = after.tables.permission_audit_log?.total_count || 0;
  const newAuditEntries = afterAuditCount - beforeAuditCount;

  if (newAuditEntries === 0) {
    console.log('✅ No new audit log entries');
  } else {
    console.log(`✅ ${newAuditEntries} new audit log entry(ies) created`);

    // Show recent entries
    const recentEntries = after.tables.permission_audit_log?.latest?.slice(0, newAuditEntries) || [];
    if (recentEntries.length > 0) {
      console.log('\nRecent audit entries:');
      recentEntries.forEach(entry => {
        console.log(`  - ${entry.role_type}.${entry.permission_key}: ${entry.old_value} → ${entry.new_value}`);
        console.log(`    At: ${entry.created_at}`);
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPARISON SUMMARY');
  console.log('='.repeat(60));
  console.log(`Permission changes: ${changes.length}`);
  console.log(`New audit entries: ${newAuditEntries}`);
  console.log(`Test duration: ${calculateDuration(before.timestamp, after.timestamp)}`);

  if (changes.length === newAuditEntries) {
    console.log('\n✅ Audit logging working correctly (changes = audit entries)');
  } else if (changes.length > 0 && newAuditEntries === 0) {
    console.log('\n⚠️  WARNING: Changes detected but no audit entries!');
  }

  console.log('='.repeat(60));

  // Save comparison report
  const report = {
    before_timestamp: before.timestamp,
    after_timestamp: after.timestamp,
    duration: calculateDuration(before.timestamp, after.timestamp),
    permission_changes: changes,
    new_audit_entries: newAuditEntries,
    audit_logging_working: changes.length === newAuditEntries
  };

  const reportPath = path.join(__dirname, '..', 'test-results', 'rbac-test-comparison.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Comparison report saved to: ${reportPath}`);
}

function calculateDuration(start, end) {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const diffMs = endTime - startTime;
  const diffMins = Math.round(diffMs / 60000);
  return `${diffMins} minute(s)`;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'before') {
    console.log('📸 CAPTURING STATE BEFORE TESTING\n');
    const state = await captureState();
    const filepath = saveState(state, 'rbac-state-before.json');

    console.log('\n' + '='.repeat(60));
    console.log('✅ BEFORE STATE CAPTURED');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Run your manual tests');
    console.log('2. When done, run: node scripts/rbac-capture-db-state.js after');
    console.log('3. Review the comparison report');
    console.log('='.repeat(60));

  } else if (command === 'after') {
    console.log('📸 CAPTURING STATE AFTER TESTING\n');
    const state = await captureState();
    const filepath = saveState(state, 'rbac-state-after.json');

    console.log('\n' + '='.repeat(60));
    console.log('✅ AFTER STATE CAPTURED');
    console.log('='.repeat(60));

    // Auto-compare
    const beforeFile = path.join(__dirname, '..', 'test-results', 'rbac-state-before.json');
    const afterFile = filepath;

    if (fs.existsSync(beforeFile)) {
      compareStates(beforeFile, afterFile);
    } else {
      console.log('\n⚠️  No "before" state found. Run "before" command first.');
    }

  } else if (command === 'compare') {
    const beforeFile = path.join(__dirname, '..', 'test-results', 'rbac-state-before.json');
    const afterFile = path.join(__dirname, '..', 'test-results', 'rbac-state-after.json');
    compareStates(beforeFile, afterFile);

  } else {
    console.log('Usage:');
    console.log('  node scripts/rbac-capture-db-state.js before   # Capture state before testing');
    console.log('  node scripts/rbac-capture-db-state.js after    # Capture state after testing');
    console.log('  node scripts/rbac-capture-db-state.js compare  # Compare before and after');
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
