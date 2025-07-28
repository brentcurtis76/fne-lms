const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function examineCheckCommunityOrganizationTrigger() {
  console.log('🔍 Examining check_community_organization trigger function...\n');
  
  try {
    // First, let's examine the growth_communities table structure
    console.log('0. Examining growth_communities table structure:');
    console.log('=' .repeat(60));
    
    const { data: tableSchema, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'growth_communities')
      .eq('table_schema', 'public')
      .order('ordinal_position');

    if (schemaError) {
      console.error('❌ Error getting table schema:', schemaError);
    } else {
      console.log('growth_communities table structure:');
      console.table(tableSchema);
    }

    // Check if the function exists using a different approach
    console.log('\n\n1. Checking if check_community_organization function exists:');
    console.log('=' .repeat(60));
    
    const { data: functionExists, error: funcExistsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type, routine_definition')
      .eq('routine_name', 'check_community_organization')
      .eq('routine_schema', 'public');

    if (funcExistsError) {
      console.error('❌ Error checking function existence:', funcExistsError);
    } else {
      if (functionExists && functionExists.length > 0) {
        console.log('✅ Function exists:');
        console.table(functionExists);
        console.log('\nFunction definition:');
        console.log(functionExists[0].routine_definition);
      } else {
        console.log('❌ Function check_community_organization does NOT exist');
      }
    }

    // Check for any triggers on growth_communities table
    console.log('\n\n2. Checking all triggers on growth_communities table:');
    console.log('=' .repeat(60));
    
    // Use raw SQL to find triggers
    const { data: allTriggers, error: allTriggersError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              t.trigger_name,
              t.event_manipulation,
              t.action_timing,
              t.action_statement
          FROM information_schema.triggers t
          WHERE t.event_object_table = 'growth_communities'
          AND t.trigger_schema = 'public';
        `
      });

    if (allTriggersError) {
      console.error('❌ Error getting triggers:', allTriggersError);
    } else {
      if (allTriggers && allTriggers.length > 0) {
        console.log('Triggers on growth_communities:');
        console.table(allTriggers);
      } else {
        console.log('❌ No triggers found on growth_communities table');
      }
    }

    // Check if there are any constraint functions that might be doing the validation
    console.log('\n\n3. Checking for constraint functions:');
    console.log('=' .repeat(60));
    
    const { data: constraints, error: constraintsError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              tc.constraint_name,
              tc.constraint_type,
              cc.check_clause
          FROM information_schema.table_constraints tc
          LEFT JOIN information_schema.check_constraints cc 
              ON tc.constraint_name = cc.constraint_name
          WHERE tc.table_name = 'growth_communities'
          AND tc.table_schema = 'public';
        `
      });

    if (constraintsError) {
      console.error('❌ Error getting constraints:', constraintsError);
    } else {
      console.log('Constraints on growth_communities:');
      console.table(constraints);
    }

    // Look for any functions that contain 'community' or 'organization'
    console.log('\n\n4. Searching for related functions:');
    console.log('=' .repeat(60));
    
    const { data: relatedFunctions, error: relatedError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type')
      .or('routine_name.ilike.%community%,routine_name.ilike.%organization%')
      .eq('routine_schema', 'public');

    if (relatedError) {
      console.error('❌ Error searching for related functions:', relatedError);
    } else {
      if (relatedFunctions && relatedFunctions.length > 0) {
        console.log('Related functions found:');
        console.table(relatedFunctions);
      } else {
        console.log('❌ No related functions found');
      }
    }

    // Try to create a test community to see what happens
    console.log('\n\n5. Testing community creation behavior:');
    console.log('=' .repeat(60));
    
    // First get the correct column structure
    const { data: sampleCommunity, error: sampleError } = await supabase
      .from('growth_communities')
      .select('*')
      .limit(1);
      
    if (sampleError) {
      console.error('❌ Error getting sample community:', sampleError);
    } else {
      console.log('Sample community structure:');
      if (sampleCommunity && sampleCommunity.length > 0) {
        console.log('Columns in growth_communities:');
        console.log(Object.keys(sampleCommunity[0]));
      } else {
        console.log('No existing communities found');
      }
    }

    // Now try a simple test with the school that has generations
    console.log('\n🧪 Testing community creation for school WITH generations (ID 19):');
    
    const { data: testResult, error: testError } = await supabase
      .from('growth_communities')
      .insert({
        name: 'TEST_TRIGGER_BEHAVIOR',
        school_id: 19, // Fundación Nueva Educación (has_generations = true)
        generation_id: null
      })
      .select();

    if (testError) {
      console.log('❌ Test failed:', testError.message);
      console.log('Full error:', testError);
    } else {
      console.log('✅ Test succeeded - community created:', testResult);
      
      // Clean up
      if (testResult && testResult.length > 0) {
        await supabase
          .from('growth_communities')
          .delete()
          .eq('id', testResult[0].id);
        console.log('🧹 Test data cleaned up');
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Run the examination
examineCheckCommunityOrganizationTrigger();