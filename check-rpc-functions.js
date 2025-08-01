#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

console.log('🔍 CHECKING RPC FUNCTIONS IN DATABASE');
console.log('=====================================');

async function checkRPCFunctions() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('🔎 Querying pg_proc for available RPC functions...');
    
    // Query the database to see what RPC functions exist
    const { data: functions, error } = await supabase
      .rpc('sql', {
        query: `
          SELECT 
            proname as function_name,
            pg_get_function_identity_arguments(oid) as arguments,
            prosrc as source_code
          FROM pg_proc 
          WHERE proname LIKE '%learning_path%' 
          OR proname LIKE '%get_user%'
          ORDER BY proname;
        `
      });

    if (error) {
      console.error('❌ Error querying functions:', error);
      
      // Try alternative approach
      console.log('🔄 Trying alternative approach - direct function call test...');
      
      try {
        const { data: testData, error: testError } = await supabase
          .rpc('get_user_path_details_with_progress', {
            p_user_id: '4ae17b21-8977-425c-b05a-ca7cdb8b9df5',
            p_path_id: '9c2cead4-3f62-4918-b1b2-8bd07ddab5fd'
          });
        
        if (testError) {
          console.error('❌ Function test failed:', testError);
          console.log('🔍 This confirms the function does not exist');
        } else {
          console.log('✅ Function exists and returned:', testData);
        }
      } catch (directError) {
        console.error('❌ Direct function call failed:', directError.message);
      }

      // Also check what functions DO exist with a simpler query
      console.log('\n🔍 Checking what functions exist with simpler query...');
      try {
        const { data: simpleFunctions, error: simpleError } = await supabase
          .from('information_schema.routines')
          .select('routine_name, routine_type')
          .eq('routine_schema', 'public')
          .like('routine_name', '%learning%');

        if (simpleError) {
          console.error('❌ Simple query error:', simpleError);
        } else {
          console.log('✅ Found learning-related functions:');
          simpleFunctions.forEach((func, index) => {
            console.log(`   ${index + 1}. ${func.routine_name} (${func.routine_type})`);
          });
        }
      } catch (simpleQueryError) {
        console.error('❌ Simple query failed:', simpleQueryError.message);
      }

    } else {
      console.log('✅ Found functions:');
      functions.forEach((func, index) => {
        console.log(`${index + 1}. ${func.function_name}(${func.arguments})`);
      });
    }

    // Test other learning path functions that should exist
    console.log('\n🧪 Testing other learning path functions...');
    
    const functionsToTest = [
      'create_full_learning_path',
      'update_full_learning_path', 
      'batch_assign_learning_path'
    ];

    for (const funcName of functionsToTest) {
      console.log(`\n🔍 Testing function: ${funcName}`);
      try {
        // Just test if function exists by calling with dummy/null params
        const { data, error } = await supabase.rpc(funcName, {});
        
        if (error) {
          if (error.message.includes('could not find function') || error.code === 'PGRST202') {
            console.log(`❌ Function ${funcName} does NOT exist`);
          } else {
            console.log(`✅ Function ${funcName} exists (got expected parameter error)`);
          }
        } else {
          console.log(`✅ Function ${funcName} exists and executed`);
        }
      } catch (testError) {
        console.log(`❌ Function ${funcName} test failed:`, testError.message);
      }
    }

  } catch (error) {
    console.error('❌ Unexpected Error:', error);
  }
}

checkRPCFunctions();