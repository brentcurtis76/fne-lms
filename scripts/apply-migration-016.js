const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
    'https://sxlogxqzmarhqsblxmtj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function applyMigration() {
    console.log('=== APPLYING MIGRATION 016 ===\n');
    console.log('Migration: Auto-enroll learning path courses\n');

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, '../database/migrations/016_auto_enroll_learning_path_courses.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing migration SQL...\n');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        // Try alternative method - execute via direct SQL
        console.log('Trying alternative execution method...\n');

        // Split SQL into individual statements and execute
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i] + ';';

            if (statement.includes('DROP FUNCTION')) {
                console.log(`[${i + 1}/${statements.length}] Dropping old function...`);
            } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
                console.log(`[${i + 1}/${statements.length}] Creating updated function...`);
            } else if (statement.includes('COMMENT')) {
                console.log(`[${i + 1}/${statements.length}] Adding comment...`);
            } else if (statement.includes('GRANT')) {
                console.log(`[${i + 1}/${statements.length}] Granting permissions...`);
            }

            // For SQL execution, we need to use a proper connection
            // Since we can't execute DDL via RPC easily, let's create a Node.js script
            // that reads and logs the SQL for manual execution
        }

        console.log('\n⚠️  Cannot execute DDL via Supabase JS client.');
        console.log('\nPlease execute the migration manually:');
        console.log('1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
        console.log('2. Copy the contents of: database/migrations/016_auto_enroll_learning_path_courses.sql');
        console.log('3. Paste and run in the SQL editor');
        console.log('\nOR run this command:');
        console.log(`\ncat ${migrationPath} | pbcopy`);
        console.log('\nThen paste into Supabase SQL editor.');

        return false;
    }

    console.log('✅ Migration applied successfully!');
    return true;
}

applyMigration()
    .then(success => {
        if (success) {
            console.log('\n✅ Ready to run backfill script');
            process.exit(0);
        } else {
            console.log('\n⚠️  Manual migration required');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('\n❌ ERROR:', error);
        process.exit(1);
    });
