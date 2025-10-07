/**
 * RBAC Pre-Test Setup
 * Ensures clean test environment before running production readiness tests
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('🔧 RBAC Pre-Test Setup\n');

  try {
    // 1. Verify feature flag
    console.log('1️⃣ Checking feature flag...');
    if (process.env.FEATURE_SUPERADMIN_RBAC !== 'true') {
      console.error('❌ FEATURE_SUPERADMIN_RBAC must be true');
      process.exit(1);
    }
    console.log('   ✅ Feature flag enabled\n');

    // 2. Verify superadmin setup
    console.log('2️⃣ Verifying superadmin setup...');
    const { data: superadmins, error: superError } = await supabase
      .from('superadmins')
      .select('user_id, is_active')
      .eq('is_active', true);

    if (superError) throw superError;

    if (superadmins.length !== 1) {
      console.error(`❌ Expected 1 superadmin, found ${superadmins.length}`);
      process.exit(1);
    }
    console.log(`   ✅ Single superadmin configured\n`);

    // 3. Create backup of current permissions
    console.log('3️⃣ Creating permission backup...');
    const { data: permissions, error: permError } = await supabase
      .from('role_permissions')
      .select('*')
      .order('role_type, permission_key');

    if (permError) throw permError;

    const backupDir = path.join(__dirname, '..', 'test-results');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `rbac-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(permissions, null, 2));
    console.log(`   ✅ Backup saved: ${backupPath}`);
    console.log(`   📊 ${permissions.length} permission records backed up\n`);

    // 4. Verify test users exist
    console.log('4️⃣ Verifying test users...');
    const testEmails = [
      'test.admin@fne-test.com',
      'test.consultor@fne-test.com',
      'test.docente@fne-test.com',
      'test.directivo@fne-test.com',
      'test.community.manager@fne-test.com',
      'test.supervisor@fne-test.com',
      'test.lider.comunidad@fne-test.com',
      'test.lider.generacion@fne-test.com'
    ];

    let page = 1;
    let allUsers = [];
    let hasMore = true;

    while (hasMore && page < 20) {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 100
      });

      if (error) throw error;
      allUsers = allUsers.concat(users);
      hasMore = users.length === 100;
      page++;
    }

    const testUsers = allUsers.filter(u => testEmails.includes(u.email));
    console.log(`   ✅ Found ${testUsers.length}/${testEmails.length} test users\n`);

    if (testUsers.length < testEmails.length) {
      console.warn('   ⚠️  Some test users missing. Run create-rbac-test-users.js first.\n');
    }

    // 5. Verify dev server is running
    console.log('5️⃣ Checking dev server...');
    try {
      const response = await fetch('http://localhost:3000/login');
      if (response.ok) {
        console.log('   ✅ Dev server running on port 3000\n');
      } else {
        console.error('   ❌ Dev server not responding correctly');
        process.exit(1);
      }
    } catch (error) {
      console.error('   ❌ Dev server not running. Run: npm run dev');
      process.exit(1);
    }

    // 6. Set test-friendly permissions
    console.log('6️⃣ Setting baseline permissions for tests...');

    // Ensure docente has minimal permissions
    await supabase.from('role_permissions').update({ granted: false })
      .eq('role_type', 'docente')
      .in('permission_key', ['view_news_all', 'create_news_all', 'view_events_all']);

    console.log('   ✅ Baseline permissions set\n');

    console.log('✅ Pre-test setup complete!\n');
    console.log('🚀 Ready to run: npm run test:rbac\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
