const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying migration 001: Create role detection system...\n');

  // Read the migration file
  const migrationPath = path.join(__dirname, '../database/migrations/001_create_role_detection_system.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log(`   Location: ${migrationPath}`);
  console.log(`   Size: ${migrationSQL.length} characters\n`);

  try {
    // Execute the migration
    console.log('⚙️  Executing migration SQL...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: migrationSQL });

    if (error) {
      // If rpc doesn't exist, we need to execute it differently
      console.log('⚠️  exec_sql RPC not available, using direct execution...\n');

      // Split the SQL into individual statements and execute them
      // We'll use a simple script approach
      const { data: result, error: execError } = await supabase
        .from('_migrations')
        .select('*')
        .limit(1);

      if (execError && execError.code === '42P01') {
        console.log('ℹ️  Migrations table does not exist, this is expected.\n');
      }

      // Let's try to execute via a Node postgres client instead
      console.log('📝 Creating a manual execution script...');

      const scriptPath = '/tmp/apply_migration_001.sql';
      fs.writeFileSync(scriptPath, migrationSQL);

      console.log(`✅ SQL script written to: ${scriptPath}`);
      console.log('\n📋 MANUAL STEPS REQUIRED:');
      console.log('1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
      console.log('2. Copy and paste the following SQL:');
      console.log('─'.repeat(80));
      console.log(migrationSQL.substring(0, 500) + '\n... (truncated, see file for full SQL)');
      console.log('─'.repeat(80));
      console.log('\nOr copy the entire file content from:', scriptPath);

    } else {
      console.log('✅ Migration executed successfully!');
      if (data) {
        console.log('   Result:', data);
      }
    }

  } catch (err) {
    console.error('❌ Error executing migration:', err);
    throw err;
  }
}

applyMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
