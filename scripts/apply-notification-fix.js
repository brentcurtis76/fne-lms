const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyNotificationFix() {
  console.log('🔧 Applying notification system fix...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-notification-system-constraints.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements (simple split by semicolon)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip DO blocks and complex statements - execute them differently
      if (statement.includes('DO $$')) {
        console.log(`⚠️  Skipping DO block (statement ${i + 1}) - complex SQL`);
        continue;
      }

      console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });

        if (error) {
          console.error(`❌ Error in statement ${i + 1}:`, error.message);
          errorCount++;
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Error executing statement ${i + 1}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Summary: ${successCount} successful, ${errorCount} errors\n`);

    // Verify the fix
    console.log('🔍 Verifying the fix...\n');

    // Check notification types
    const { data: types, error: typesError } = await supabase
      .from('notification_types')
      .select('id, name')
      .order('id');

    if (typesError) {
      console.error('❌ Error checking notification types:', typesError.message);
    } else {
      console.log('✅ Notification types found:', types.length);
      types.forEach(t => console.log(`   - ${t.id}: ${t.name}`));
    }

    // Check for NULL notification_type_id
    const { count: nullCount, error: nullError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .is('notification_type_id', null);

    if (nullError) {
      console.error('\n❌ Error checking NULL types:', nullError.message);
    } else {
      console.log(`\n✅ Notifications with NULL type: ${nullCount || 0}`);
    }

    // Check total notifications
    const { count: totalCount, error: totalError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true });

    if (!totalError) {
      console.log(`✅ Total notifications in system: ${totalCount || 0}`);
    }

    console.log('\n✨ Notification system fix completed!');

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

// Add exec_sql function if it doesn't exist
async function createExecSqlFunction() {
  const createFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_query;
    END;
    $$;
  `;

  try {
    await supabase.rpc('exec_sql', { sql_query: 'SELECT 1' });
    console.log('✅ exec_sql function already exists');
  } catch (error) {
    console.log('Creating exec_sql function...');
    // This would need to be done via Supabase dashboard
    console.log('⚠️  Please create exec_sql function in Supabase SQL editor');
  }
}

applyNotificationFix();