const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getTriggerFunctionSource() {
  console.log('🔍 Getting check_community_organization function source...\n');
  
  try {
    // Use direct PostgreSQL system catalogs to get function definition
    const { data: functionData, error: functionError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              p.proname as function_name,
              pg_get_functiondef(p.oid) as function_definition,
              t.typname as return_type,
              p.prosrc as function_body
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          LEFT JOIN pg_type t ON p.prorettype = t.oid
          WHERE p.proname = 'check_community_organization'
          AND n.nspname = 'public';
        `
      });

    if (functionError) {
      console.error('❌ Error getting function:', functionError);
      return;
    }

    if (!functionData || functionData.length === 0) {
      console.log('❌ Function check_community_organization not found');
      return;
    }

    console.log('✅ Function found!');
    console.log('Function name:', functionData[0].function_name);
    console.log('Return type:', functionData[0].return_type);
    console.log('\n📋 COMPLETE FUNCTION DEFINITION:');
    console.log('=' .repeat(80));
    console.log(functionData[0].function_definition);
    
    console.log('\n\n📋 FUNCTION BODY ONLY:');
    console.log('=' .repeat(80));
    console.log(functionData[0].function_body);

    // Now get trigger information
    console.log('\n\n🔧 TRIGGER CONFIGURATION:');
    console.log('=' .repeat(80));
    
    const { data: triggerData, error: triggerError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              t.tgname as trigger_name,
              c.relname as table_name,
              p.proname as function_name,
              CASE t.tgenabled 
                  WHEN 'O' THEN 'enabled'
                  WHEN 'D' THEN 'disabled'
                  ELSE 'unknown'
              END as status,
              CASE t.tgtype & 2
                  WHEN 0 THEN 'BEFORE'
                  ELSE 'AFTER'
              END as timing,
              CASE 
                  WHEN t.tgtype & 4 = 4 THEN 'INSERT '
                  ELSE ''
              END ||
              CASE 
                  WHEN t.tgtype & 8 = 8 THEN 'DELETE '
                  ELSE ''
              END ||
              CASE 
                  WHEN t.tgtype & 16 = 16 THEN 'UPDATE '
                  ELSE ''
              END as events
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_proc p ON t.tgfoid = p.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE p.proname = 'check_community_organization'
          AND n.nspname = 'public'
          AND NOT t.tgisinternal;
        `
      });

    if (triggerError) {
      console.error('❌ Error getting trigger info:', triggerError);
    } else if (triggerData && triggerData.length > 0) {
      console.table(triggerData);
    } else {
      console.log('❌ No triggers found using this function');
    }

    // Test the trigger behavior with different scenarios
    console.log('\n\n🧪 TESTING TRIGGER BEHAVIOR:');
    console.log('=' .repeat(80));
    
    console.log('\n1. Test: School WITHOUT generations (should succeed)');
    const { data: test1, error: error1 } = await supabase
      .from('growth_communities')
      .insert({
        name: 'TEST_NO_GENERATIONS',
        school_id: 1, // Liceo Juana Ross de Edwards (has_generations = false)
        generation_id: null
      })
      .select();

    if (error1) {
      console.log('❌ Failed:', error1.message);
    } else {
      console.log('✅ Succeeded:', test1);
      // Clean up
      if (test1 && test1[0]) {
        await supabase.from('growth_communities').delete().eq('id', test1[0].id);
        console.log('🧹 Cleaned up test data');
      }
    }

    console.log('\n2. Test: School WITH generations, no generation_id (should fail)');
    const { data: test2, error: error2 } = await supabase
      .from('growth_communities')
      .insert({
        name: 'TEST_WITH_GENERATIONS_NO_ID',
        school_id: 19, // Fundación Nueva Educación (has_generations = true)
        generation_id: null
      })
      .select();

    if (error2) {
      console.log('❌ Failed as expected:', error2.message);
    } else {
      console.log('⚠️  Unexpectedly succeeded:', test2);
      // Clean up
      if (test2 && test2[0]) {
        await supabase.from('growth_communities').delete().eq('id', test2[0].id);
        console.log('🧹 Cleaned up test data');
      }
    }

    // Find a valid generation for the test
    console.log('\n3. Getting valid generation for school 19...');
    const { data: generations, error: genError } = await supabase
      .from('generations')
      .select('id, name')
      .eq('school_id', 19)
      .limit(1);

    if (genError) {
      console.error('❌ Error getting generations:', genError);
    } else if (generations && generations.length > 0) {
      console.log('✅ Found generation:', generations[0]);
      
      console.log('\n4. Test: School WITH generations, WITH valid generation_id (should succeed)');
      const { data: test3, error: error3 } = await supabase
        .from('growth_communities')
        .insert({
          name: 'TEST_WITH_VALID_GENERATION',
          school_id: 19,
          generation_id: generations[0].id
        })
        .select();

      if (error3) {
        console.log('❌ Failed:', error3.message);
      } else {
        console.log('✅ Succeeded:', test3);
        // Clean up
        if (test3 && test3[0]) {
          await supabase.from('growth_communities').delete().eq('id', test3[0].id);
          console.log('🧹 Cleaned up test data');
        }
      }
    } else {
      console.log('❌ No generations found for school 19');
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Run the function
getTriggerFunctionSource();