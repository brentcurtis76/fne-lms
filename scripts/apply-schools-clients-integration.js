const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function applySchoolsClientsIntegration() {
  try {
    console.log('Starting schools-clients integration...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'integrate-schools-clients.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // If exec_sql doesn't exist, we'll need to run the SQL manually
      console.log('Note: Could not execute SQL automatically. Please run the following SQL in your Supabase SQL editor:');
      console.log('\n' + sql);
      return;
    }
    
    console.log('✅ Schools-clients integration applied successfully!');
    
    // Try to run the linking function
    console.log('\nAttempting to link existing schools with matching clients...');
    const { data: linkResult, error: linkError } = await supabase.rpc('link_existing_schools_clients');
    
    if (linkError) {
      console.log('Could not auto-link schools and clients. You can do this manually later.');
    } else if (linkResult && linkResult.length > 0) {
      console.log(`\n✅ Linked ${linkResult[0].matched_count} schools with clients:`);
      linkResult.forEach(match => {
        console.log(`  - School: ${match.school_name} → Client: ${match.client_name}`);
      });
    } else {
      console.log('No matching schools and clients found to link.');
    }
    
  } catch (error) {
    console.error('Error applying integration:', error);
  }
}

// Run the integration
applySchoolsClientsIntegration();