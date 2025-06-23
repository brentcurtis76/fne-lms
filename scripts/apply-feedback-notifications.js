const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function applyFeedbackNotifications() {
  console.log('🚀 Setting up feedback notification triggers...\n');

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'add-feedback-notification-trigger.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { 
        sql_query: statement + ';' 
      });

      if (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error);
        // Continue with other statements even if one fails
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }

    console.log('\n✅ Feedback notification triggers setup complete!');
    console.log('📌 Admins will now receive notifications when users submit feedback');

  } catch (error) {
    console.error('❌ Error applying feedback notifications:', error);
    process.exit(1);
  }
}

// Run the script
applyFeedbackNotifications();