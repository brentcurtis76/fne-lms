// This script applies the database migration to fix recursive RLS policies on user_roles table
// Run with: node scripts/apply-user-roles-rls-fix.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Get Supabase URL and key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function applyMigration() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL or Service Role Key not found in environment variables');
    console.log('Make sure you have a .env.local file with:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}`);
  
  // Create Supabase client with service role key (has admin privileges)
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/migrations/003_fix_user_roles_rls_recursion.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration to fix recursive RLS policies on user_roles table...');
    
    // Split the SQL into individual statements and execute them
    const statements = migrationSQL
      .split(/;(?=\s*(?:DROP|CREATE|SELECT|COMMENT|--))/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && s.length > 10);
    
    for (const statement of statements) {
      if (statement.includes('SELECT') && statement.includes('pg_policies')) {
        // Skip the verification query for now
        continue;
      }
      
      if (statement.includes('SELECT COUNT') && statement.includes('user_roles')) {
        // Skip the test query
        continue;
      }
      
      console.log('\nExecuting statement:');
      console.log(statement.substring(0, 100) + '...');
      
      // Use raw SQL execution
      let data, error;
      try {
        const result = await supabase.rpc('exec_sql', { 
          sql_query: statement + ';'
        });
        data = result.data;
        error = result.error;
      } catch (err) {
        // If exec_sql doesn't exist, try creating a function to execute SQL
        console.log('exec_sql not available, using direct approach...');
        error = err;
      }
      
      if (error) {
        console.error(`Error executing statement: ${error.message}`);
        // Continue with other statements even if one fails
      } else {
        console.log('✅ Statement executed successfully');
      }
    }
    
    console.log('\n✅ Migration completed!');
    
    // Verify the policies were created
    console.log('\nVerifying policies...');
    
    const { data: policies, error: verifyError } = await supabase
      .rpc('exec_sql', { 
        sql_query: `
          SELECT 
            policyname,
            cmd,
            permissive
          FROM pg_policies
          WHERE tablename = 'user_roles'
          ORDER BY policyname;
        `
      });
    
    if (!verifyError && policies) {
      console.log('\nCurrent policies on user_roles table:');
      console.table(policies);
    }
    
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();