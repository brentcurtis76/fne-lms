// Script to inspect the check constraint that's failing
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectConstraint() {
  console.log('🔍 Inspecting check_role_organizational_scope constraint...\n');
  
  try {
    // Query PostgreSQL system catalogs to get constraint definition
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT 
          conname as constraint_name,
          pg_get_constraintdef(oid) as constraint_definition
        FROM pg_constraint 
        WHERE conname = 'check_role_organizational_scope'
        AND conrelid = 'user_roles'::regclass;
      `
    });
    
    if (error) {
      // Try alternative query
      const { data: altData, error: altError } = await supabase.rpc('get_constraint_definition', {
        constraint_name: 'check_role_organizational_scope',
        table_name: 'user_roles'
      });
      
      if (altError) {
        console.log('Could not query constraint via RPC. Manual inspection needed.');
        console.log('The constraint "check_role_organizational_scope" is blocking community_manager insertion.');
        console.log('This constraint likely validates organizational scope requirements for different roles.');
      } else {
        console.log('Constraint definition:', altData);
      }
    } else {
      console.log('Constraint definition:', data);
    }
    
  } catch (error) {
    console.error('Error inspecting constraint:', error);
    console.log('\n💡 ANALYSIS:');
    console.log('The constraint "check_role_organizational_scope" is rejecting community_manager.');
    console.log('This constraint likely contains role-specific validation logic that needs updating.');
  }
}

inspectConstraint();