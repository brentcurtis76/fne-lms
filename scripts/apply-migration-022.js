/**
 * Apply migration 022: Add transformation access table
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

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🔧 Applying migration 022...\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/022_add_transformation_access_table.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log(`   Size: ${sql.length} bytes\n`);

  try {
    // Execute migration using Supabase client
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      // If rpc doesn't exist, we need to execute directly
      console.log('⚠️  exec_sql RPC not available, executing statements directly...\n');

      // Split SQL into individual statements and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i] + ';';

        // Skip comments and DO blocks separately
        if (statement.startsWith('--')) continue;

        console.log(`Executing statement ${i + 1}/${statements.length}...`);

        try {
          const { error: execError } = await supabase.rpc('exec_sql', { sql_string: statement });

          if (execError) {
            console.error(`❌ Error in statement ${i + 1}:`, execError);
            throw execError;
          }

          console.log(`✅ Statement ${i + 1} executed`);
        } catch (err) {
          console.error(`❌ Failed to execute statement ${i + 1}:`, err.message);
          throw err;
        }
      }
    }

    console.log('\n✅ Migration 022 applied successfully!\n');

    // Verify migration
    console.log('🔍 Verifying migration...\n');

    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', [
        'growth_community_transformation_access',
        'transformation_access_audit_log',
      ]);

    if (tables && tables.length === 2) {
      console.log('✅ Tables created successfully:');
      tables.forEach(t => console.log(`   - ${t.table_name}`));
    } else {
      console.log('⚠️  Could not verify tables (might need manual check)');
    }

    // Check migrated data
    const { count } = await supabase
      .from('growth_community_transformation_access')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    console.log(`\n📊 Communities with transformation access: ${count || 0}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
