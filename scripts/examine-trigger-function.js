const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function examineCheckCommunityOrganizationTrigger() {
  console.log('🔍 Examining check_community_organization trigger function...\n');
  
  try {
    // 1. Get the current trigger function source
    console.log('1. Getting trigger function source code:');
    console.log('=' .repeat(60));
    
    const { data: functionData, error: functionError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT pg_get_functiondef(p.oid) as function_definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = 'check_community_organization'
          AND n.nspname = 'public';
        `
      });

    if (functionError) {
      console.error('❌ Error getting function definition:', functionError);
      
      // Try alternative approach with direct query
      console.log('\n🔄 Trying alternative approach with direct SQL...');
      
      const { data: altData, error: altError } = await supabase
        .from('information_schema.routines')
        .select('routine_definition')
        .eq('routine_name', 'check_community_organization')
        .eq('routine_schema', 'public');
        
      if (altError) {
        console.error('❌ Alternative approach also failed:', altError);
      } else {
        console.log('Function definition (alternative method):', altData);
      }
    } else {
      console.log('Function definition:');
      if (functionData && functionData.length > 0) {
        console.log(functionData[0].function_definition);
      } else {
        console.log('❌ No function found with name check_community_organization');
      }
    }

    // 2. Check current trigger configuration
    console.log('\n\n2. Checking trigger configuration:');
    console.log('=' .repeat(60));
    
    const { data: triggerData, error: triggerError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              t.tgname as trigger_name,
              c.relname as table_name,
              p.proname as function_name,
              t.tgenabled as is_enabled,
              CASE t.tgtype & 2
                  WHEN 0 THEN 'BEFORE'
                  ELSE 'AFTER'
              END as trigger_timing,
              CASE t.tgtype & 28
                  WHEN 4 THEN 'INSERT'
                  WHEN 8 THEN 'DELETE'
                  WHEN 16 THEN 'UPDATE'
                  WHEN 12 THEN 'INSERT OR DELETE'
                  WHEN 20 THEN 'INSERT OR UPDATE'
                  WHEN 24 THEN 'DELETE OR UPDATE'
                  WHEN 28 THEN 'INSERT OR DELETE OR UPDATE'
              END as trigger_events
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_proc p ON t.tgfoid = p.oid
          WHERE p.proname = 'check_community_organization'
          AND NOT t.tgisinternal;
        `
      });

    if (triggerError) {
      console.error('❌ Error getting trigger configuration:', triggerError);
    } else {
      console.log('Trigger configuration:');
      console.table(triggerData);
    }

    // 3. Get schools information to understand the context
    console.log('\n\n3. Checking schools with has_generations flag:');
    console.log('=' .repeat(60));
    
    const { data: schoolsData, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('id');

    if (schoolsError) {
      console.error('❌ Error getting schools data:', schoolsError);
    } else {
      console.log('Schools with generation flags:');
      console.table(schoolsData);
      
      const withGenerations = schoolsData.filter(s => s.has_generations).length;
      const withoutGenerations = schoolsData.filter(s => !s.has_generations).length;
      
      console.log(`\n📊 Summary: ${withGenerations} schools with generations, ${withoutGenerations} without`);
    }

    // 4. Test the current trigger behavior (safe test)
    console.log('\n\n4. Testing trigger behavior (safe test - will rollback):');
    console.log('=' .repeat(60));
    
    // Find a school without generations for safe testing
    const schoolWithoutGen = schoolsData.find(s => !s.has_generations);
    const schoolWithGen = schoolsData.find(s => s.has_generations);
    
    if (schoolWithoutGen) {
      console.log(`\n🧪 Test 1: Creating community for school WITHOUT generations (${schoolWithoutGen.name})`);
      
      const { data: testData1, error: testError1 } = await supabase
        .from('growth_communities')
        .insert({
          name: 'TRIGGER_TEST_COMMUNITY_1',
          school_id: schoolWithoutGen.id,
          generation_id: null,
          created_by: 'b8e4e2f0-8a1e-4c3d-9f2e-1234567890ab' // Use a test UUID
        })
        .select();

      if (testError1) {
        console.log('❌ Test 1 failed (as expected?):', testError1.message);
      } else {
        console.log('✅ Test 1 succeeded - community created:', testData1);
        
        // Clean up immediately
        await supabase
          .from('growth_communities')
          .delete()
          .eq('name', 'TRIGGER_TEST_COMMUNITY_1');
        console.log('🧹 Test data cleaned up');
      }
    }

    if (schoolWithGen) {
      console.log(`\n🧪 Test 2: Creating community for school WITH generations (${schoolWithGen.name}) without generation_id`);
      
      const { data: testData2, error: testError2 } = await supabase
        .from('growth_communities')
        .insert({
          name: 'TRIGGER_TEST_COMMUNITY_2',
          school_id: schoolWithGen.id,
          generation_id: null,
          created_by: 'b8e4e2f0-8a1e-4c3d-9f2e-1234567890ab'
        })
        .select();

      if (testError2) {
        console.log('❌ Test 2 failed (as expected):', testError2.message);
      } else {
        console.log('✅ Test 2 succeeded:', testData2);
        
        // Clean up immediately
        await supabase
          .from('growth_communities')
          .delete()
          .eq('name', 'TRIGGER_TEST_COMMUNITY_2');  
        console.log('🧹 Test data cleaned up');
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Run the examination
examineCheckCommunityOrganizationTrigger();