/**
 * Apply migration 022 with code review fixes
 *
 * This script applies the updated migration that includes:
 * - CRITICAL FIX: Legacy flag sync triggers
 * - MEDIUM FIX: Audit log INSERT trigger
 * - All original migration content
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🔧 Applying migration 022 with code review fixes...\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/022_add_transformation_access_table.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log(`   Size: ${sql.length} bytes`);
  console.log(`   Lines: ${sql.split('\n').length}`);
  console.log('');

  // Since we can't execute raw SQL directly through Supabase JS client,
  // we'll provide instructions for manual execution
  console.log('📋 INSTRUCTIONS FOR MANUAL APPLICATION:\n');
  console.log('1. Open Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new\n');
  console.log('2. Copy the entire content of:');
  console.log('   database/migrations/022_add_transformation_access_table.sql\n');
  console.log('3. Paste into SQL Editor and click "Run"\n');
  console.log('4. Verify success message appears\n');

  console.log('⏳ Waiting for manual application...\n');
  console.log('After applying, run verification tests with:');
  console.log('   node scripts/verify-migration-022.js\n');

  // Try to verify if tables exist (will fail if migration not applied yet)
  console.log('🔍 Checking if migration was already applied...\n');

  const { data: tables, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .in('table_name', [
      'growth_community_transformation_access',
      'transformation_access_audit_log',
    ]);

  if (error) {
    console.log('⚠️  Cannot verify (may need manual execution):', error.message);
  } else if (tables && tables.length === 2) {
    console.log('✅ Migration appears to be already applied!');
    console.log('   Tables found:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    console.log('');
    console.log('You can now run verification tests:');
    console.log('   node scripts/verify-migration-022.js\n');
  } else if (tables && tables.length > 0) {
    console.log('⚠️  Partial migration detected:');
    console.log(`   Found ${tables.length} of 2 expected tables`);
    console.log('   Please apply migration manually\n');
  } else {
    console.log('ℹ️  Migration not yet applied');
    console.log('   Please follow instructions above\n');
  }
}

applyMigration().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
