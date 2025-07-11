require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQLFile(filePath, description) {
  console.log(`\n${description}...`);
  
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split by semicolons but preserve them for execution
    const statements = sql
      .split(/;\s*$/m)
      .filter(stmt => stmt.trim())
      .map(stmt => stmt.trim() + ';');
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip SELECT statements at the end (verification queries)
      if (statement.toLowerCase().startsWith('select')) {
        console.log('Skipping verification query');
        continue;
      }
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      // Execute through a custom function or direct SQL
      const { data, error } = await supabase.rpc('exec_sql', { 
        sql: statement 
      }).catch(async (err) => {
        // If exec_sql doesn't exist, try direct execution
        console.log('exec_sql not available, attempting direct execution...');
        
        // For this to work, you'd need to use a raw PostgreSQL connection
        // Since we can't do that directly, we'll provide instructions
        throw new Error('Direct SQL execution not available through Supabase JS client');
      });
      
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        console.error(`Statement: ${statement.substring(0, 100)}...`);
      } else {
        console.log('✅ Success');
      }
    }
  } catch (error) {
    console.error(`❌ Failed to execute ${filePath}:`, error.message);
  }
}

async function applyRLSFix() {
  console.log('🔧 Applying RLS fixes to user_roles table...\n');
  
  console.log('⚠️  Note: If exec_sql RPC is not available, you\'ll need to run these SQL files manually:');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Run each file in order:\n');
  
  const sqlFiles = [
    {
      path: path.join(__dirname, '../database/ensure-auth-is-admin-function.sql'),
      description: 'Step 1: Creating auth_is_admin() function'
    },
    {
      path: path.join(__dirname, '../database/fix-recursive-rls-policies.sql'),
      description: 'Step 2: Fixing recursive RLS policies'
    }
  ];
  
  for (const file of sqlFiles) {
    if (fs.existsSync(file.path)) {
      console.log(`📄 ${file.path}`);
      await executeSQLFile(file.path, file.description);
    } else {
      console.error(`❌ File not found: ${file.path}`);
    }
  }
  
  console.log('\n✨ Process complete!');
  console.log('\nNext steps:');
  console.log('1. Run "node scripts/verify-rls-fix.js" to verify the fixes');
  console.log('2. Test user authentication and role checks in the application');
}

// Check if exec_sql function exists first
async function checkExecSQL() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: 'SELECT 1'
  }).catch(() => ({ data: null, error: true }));
  
  if (error) {
    console.log('\n⚠️  exec_sql RPC function not available.');
    console.log('Please run the SQL files manually in your Supabase SQL Editor:\n');
    console.log('1. database/ensure-auth-is-admin-function.sql');
    console.log('2. database/fix-recursive-rls-policies.sql\n');
    return false;
  }
  return true;
}

// Main execution
async function main() {
  const hasExecSQL = await checkExecSQL();
  if (hasExecSQL) {
    await applyRLSFix();
  }
}

main();