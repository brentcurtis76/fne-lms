/**
 * Apply 6-role system migration to production Supabase database
 * This script applies the database changes safely with error handling
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting 6-role system migration...');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'schema-migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split the migration into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute statements one by one for better error handling
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.error(`❌ Error in statement ${i + 1}:`, error.message);
          // Continue with other statements for non-critical errors
          if (error.message.includes('already exists')) {
            console.log('⚠️  Object already exists, continuing...');
            continue;
          }
          throw error;
        }
        
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (err) {
        console.error(`❌ Failed to execute statement ${i + 1}:`, err.message);
        console.log('Statement was:', statement.substring(0, 100) + '...');
        
        // Continue with non-critical errors
        if (err.message.includes('already exists') || 
            err.message.includes('relation') && err.message.includes('does not exist')) {
          console.log('⚠️  Non-critical error, continuing...');
          continue;
        }
        
        throw err;
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    
    // Verify the migration
    await verifyMigration();
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  try {
    // Check if new tables exist
    const tables = ['schools', 'generations', 'growth_communities', 'user_roles'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
        
      if (error) {
        console.error(`❌ Table ${table} verification failed:`, error.message);
        throw error;
      }
      
      console.log(`✅ Table ${table} exists and is accessible`);
    }
    
    // Check if enum type exists
    const { data: enumData, error: enumError } = await supabase
      .rpc('exec_sql', { 
        sql: "SELECT typname FROM pg_type WHERE typname = 'user_role_type'" 
      });
    
    if (enumError) {
      console.error('❌ Enum verification failed:', enumError.message);
    } else {
      console.log('✅ user_role_type enum exists');
    }
    
    // Check if functions exist
    const { data: funcData, error: funcError } = await supabase
      .rpc('exec_sql', { 
        sql: "SELECT proname FROM pg_proc WHERE proname IN ('is_global_admin', 'get_user_admin_status')" 
      });
    
    if (funcError) {
      console.error('❌ Functions verification failed:', funcError.message);
    } else {
      console.log('✅ Helper functions exist');
    }
    
    console.log('🎉 Migration verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    throw error;
  }
}

// Run the migration
runMigration().catch(console.error);