const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSQLMigration() {
  console.log('🚀 Starting Learning Paths RPC functions migration...\n');

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '..', 'database', 'learning-paths-rpc-functions.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // Split the SQL content into individual statements
    // We'll execute the CREATE FUNCTION statements separately
    const functionStatements = sqlContent.split(/(?=CREATE OR REPLACE FUNCTION)/g)
      .filter(stmt => stmt.trim().startsWith('CREATE OR REPLACE FUNCTION'));

    // Execute each function creation
    for (let i = 0; i < functionStatements.length; i++) {
      const functionSql = functionStatements[i];
      
      // Extract function name for logging
      const functionNameMatch = functionSql.match(/CREATE OR REPLACE FUNCTION (\w+)/);
      const functionName = functionNameMatch ? functionNameMatch[1] : `Function ${i + 1}`;
      
      console.log(`Creating function: ${functionName}...`);
      
      // Find the complete function including GRANT and COMMENT statements
      let completeFunction = functionSql;
      const nextFunctionIndex = sqlContent.indexOf(functionSql) + functionSql.length;
      const remainingContent = sqlContent.substring(nextFunctionIndex);
      
      // Look for GRANT and COMMENT statements that follow this function
      const grantMatch = remainingContent.match(/^.*?GRANT EXECUTE ON FUNCTION.*?;/ms);
      const commentMatch = remainingContent.match(/^.*?COMMENT ON FUNCTION.*?;/ms);
      
      if (grantMatch) {
        completeFunction += '\n' + grantMatch[0];
      }
      if (commentMatch) {
        completeFunction += '\n' + commentMatch[0];
      }
      
      const { error } = await supabase.rpc('query', { query: completeFunction });
      
      if (error) {
        console.error(`❌ Error creating ${functionName}:`, error.message);
        throw error;
      }
      
      console.log(`✅ ${functionName} created successfully`);
    }

    // Now verify the functions exist
    console.log('\n🔍 Verifying functions...');
    
    const functionNames = ['create_full_learning_path', 'update_full_learning_path', 'batch_assign_learning_path'];
    
    for (const funcName of functionNames) {
      const { data, error } = await supabase.rpc('query', {
        query: `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${funcName}');`
      });
      
      if (error) {
        console.error(`❌ Error verifying ${funcName}:`, error.message);
      } else if (data && data[0]?.exists) {
        console.log(`✅ Function ${funcName} verified`);
      } else {
        console.error(`❌ Function ${funcName} not found`);
      }
    }

    console.log('\n✅ All Learning Paths RPC functions created successfully!');
    console.log('\n📝 Summary:');
    console.log('- create_full_learning_path: Creates learning paths with courses atomically');
    console.log('- update_full_learning_path: Updates learning paths and courses atomically');
    console.log('- batch_assign_learning_path: Assigns paths to multiple users/groups atomically');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
executeSQLMigration();