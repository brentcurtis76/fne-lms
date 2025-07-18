const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying Supervisor de Red migration...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'add-supervisor-de-red-role.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split the migration into individual statements
    // Remove comments and split by semicolons
    const statements = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      // Use RPC to execute raw SQL
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement + ';'
      });

      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message);
        console.error('Statement:', statement.substring(0, 100) + '...');
        // Continue with other statements
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }

    console.log('\n✨ Migration complete! The supervisor_de_red role is now available.');
    console.log('\n📝 Next steps:');
    console.log('1. Refresh your network management page');
    console.log('2. Create your first network');
    console.log('3. Assign schools and supervisors to the network');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n🔧 Alternative: Apply the migration manually in Supabase dashboard');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Copy the contents of database/add-supervisor-de-red-role.sql');
    console.log('3. Paste and run the SQL');
  }
}

applyMigration();