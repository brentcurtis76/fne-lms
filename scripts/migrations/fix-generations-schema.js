/**
 * Fix generations table to use INTEGER school_id instead of UUID
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function fixGenerationsSchema() {
  console.log('🔧 Fixing generations table schema...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // First, clear any existing data in generations
    console.log('🧹 Clearing existing generations data...');
    const { error: clearError } = await supabase
      .from('generations')
      .delete()
      .neq('id', 0); // Delete all records
    
    if (clearError && clearError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.warn('⚠️  Warning clearing generations:', clearError.message);
    } else {
      console.log('✅ Cleared generations table');
    }
    
    // Check current schema
    console.log('🔍 Checking current generations table schema...');
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', 'generations')
      .eq('column_name', 'school_id');
    
    if (schemaError) {
      throw new Error(`Schema check failed: ${schemaError.message}`);
    }
    
    if (columns && columns.length > 0) {
      const schoolIdColumn = columns[0];
      console.log(`📋 Current school_id column: ${schoolIdColumn.data_type}`);
      
      if (schoolIdColumn.data_type === 'uuid') {
        console.log('🔄 Converting school_id from UUID to INTEGER...');
        
        // Use raw SQL to alter the column type
        const alterSql = `
          -- Drop foreign key constraint first
          ALTER TABLE public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;
          
          -- Convert column to integer
          ALTER TABLE public.generations ALTER COLUMN school_id TYPE integer USING NULL;
          
          -- Re-add foreign key constraint
          ALTER TABLE public.generations ADD CONSTRAINT generations_school_id_fkey 
            FOREIGN KEY (school_id) REFERENCES public.schools(id);
        `;
        
        // Execute via RPC (if available) or direct SQL
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql: alterSql })
          });
          
          if (!response.ok) {
            throw new Error(`SQL execution failed: ${response.statusText}`);
          }
          
          console.log('✅ Successfully converted school_id to INTEGER');
        } catch (sqlError) {
          console.log('⚠️  Direct SQL failed, attempting manual approach...');
          
          // Manual approach: Create a new column and migrate
          console.log('🔧 Creating new integer school_id column...');
          
          // This won't work directly via Supabase client, so let's provide SQL
          console.log('\n📝 Please execute this SQL in Supabase SQL Editor:');
          console.log('=' .repeat(60));
          console.log(alterSql);
          console.log('=' .repeat(60));
          
          return false;
        }
      } else if (schoolIdColumn.data_type === 'integer') {
        console.log('✅ school_id is already INTEGER type');
      } else {
        console.log(`⚠️  Unexpected data type: ${schoolIdColumn.data_type}`);
      }
    } else {
      console.log('❌ school_id column not found in generations table');
      return false;
    }
    
    // Verify the fix
    console.log('🔍 Verifying schema fix...');
    const { data: newColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'generations')
      .eq('column_name', 'school_id');
    
    if (newColumns && newColumns.length > 0) {
      console.log(`✅ Verified: school_id is now ${newColumns[0].data_type}`);
      return newColumns[0].data_type === 'integer';
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Schema fix failed:', error.message);
    return false;
  }
}

// Run the fix
if (require.main === module) {
  fixGenerationsSchema()
    .then(success => {
      if (success) {
        console.log('\n✅ SCHEMA FIX COMPLETED');
        console.log('✅ generations.school_id is now INTEGER');
        console.log('✅ Ready to run data seeding');
      } else {
        console.log('\n⚠️  MANUAL SQL REQUIRED');
        console.log('Please execute the SQL shown above in Supabase SQL Editor');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 SCHEMA FIX FAILED:', error.message);
      process.exit(1);
    });
}

module.exports = { fixGenerationsSchema };