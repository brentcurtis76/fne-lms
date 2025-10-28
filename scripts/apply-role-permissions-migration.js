/**
 * Apply role_permissions table migration
 * Creates the table structure for storing RBAC permissions
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('📦 Applying role_permissions migration...\n');

  try {
    // Read the SQL migration file
    const migrationPath = path.join(__dirname, '../database/migrations/002_create_role_permissions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comment-only lines
      if (statement.trim().startsWith('--')) continue;

      console.log(`Executing statement ${i + 1}/${statements.length}...`);

      const { error } = await supabase.rpc('exec_sql', { sql_query: statement }).single();

      if (error) {
        // Try direct execution if exec_sql doesn't exist
        const { error: directError } = await supabase
          .from('_migration_execution')
          .insert({ sql: statement });

        if (directError) {
          // For CREATE TABLE and other DDL, we need to use the REST API differently
          // Since we can't execute raw SQL directly, we'll note this
          if (statement.includes('CREATE TABLE') ||
              statement.includes('CREATE INDEX') ||
              statement.includes('ALTER TABLE') ||
              statement.includes('CREATE POLICY') ||
              statement.includes('CREATE FUNCTION') ||
              statement.includes('CREATE TRIGGER') ||
              statement.includes('GRANT')) {
            console.log(`   ⚠️  DDL statement - needs manual execution via Supabase dashboard`);
            console.log(`   Statement: ${statement.substring(0, 80)}...`);
          } else {
            console.log(`   ❌ Error: ${directError.message}`);
          }
        }
      } else {
        console.log(`   ✅ Success`);
      }
    }

    console.log('\n✅ Migration application complete');
    console.log('\n⚠️  NOTE: If any DDL statements failed, you need to:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Paste the contents of database/migrations/002_create_role_permissions.sql');
    console.log('3. Click "Run" to execute');
    console.log('\nOr use the Supabase CLI: supabase db execute --file database/migrations/002_create_role_permissions.sql');

  } catch (error) {
    console.error('💥 Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
