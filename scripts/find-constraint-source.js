const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findConstraintSource() {
  console.log('🔍 Finding source of generation_id validation...\n');
  
  try {
    // Check for check constraints on growth_communities
    console.log('1. Checking CHECK constraints:');
    console.log('=' .repeat(60));
    
    const { data: checkConstraints, error: checkError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              tc.constraint_name,
              tc.constraint_type,
              cc.check_clause
          FROM information_schema.table_constraints tc
          JOIN information_schema.check_constraints cc 
              ON tc.constraint_name = cc.constraint_name
          WHERE tc.table_name = 'growth_communities'
          AND tc.table_schema = 'public'
          AND tc.constraint_type = 'CHECK';
        `
      });

    if (checkError) {
      console.error('❌ Error getting check constraints:', checkError);
    } else {
      if (checkConstraints && checkConstraints.length > 0) {
        console.log('✅ Found CHECK constraints:');
        console.table(checkConstraints);
      } else {
        console.log('❌ No CHECK constraints found');
      }
    }

    // Check for RLS policies
    console.log('\n\n2. Checking RLS policies:');
    console.log('=' .repeat(60));
    
    const { data: rlsPolicies, error: rlsError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              schemaname,
              tablename,
              policyname,
              permissive,
              roles,
              cmd,
              qual,
              with_check
          FROM pg_policies 
          WHERE tablename = 'growth_communities';
        `
      });

    if (rlsError) {
      console.error('❌ Error getting RLS policies:', rlsError);
    } else {
      if (rlsPolicies && rlsPolicies.length > 0) {
        console.log('✅ Found RLS policies:');
        console.table(rlsPolicies);
        
        // Check if any policy contains the validation logic
        rlsPolicies.forEach((policy, index) => {
          console.log(`\nPolicy ${index + 1} - ${policy.policyname}:`);
          console.log('Qualification clause:', policy.qual);
          console.log('With check clause:', policy.with_check);
        });
      } else {
        console.log('❌ No RLS policies found');
      }
    }

    // Check all functions that might contain this logic
    console.log('\n\n3. Searching all functions for generation validation:');
    console.log('=' .repeat(60));
    
    const { data: allFunctions, error: allFuncError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              p.proname as function_name,
              pg_get_functiondef(p.oid) as function_definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          AND (
              pg_get_functiondef(p.oid) ILIKE '%generation_id%' 
              OR pg_get_functiondef(p.oid) ILIKE '%has_generations%'
              OR pg_get_functiondef(p.oid) ILIKE '%growth_communities%'
          );
        `
      });

    if (allFuncError) {
      console.error('❌ Error searching functions:', allFuncError);
    } else {
      if (allFunctions && allFunctions.length > 0) {
        console.log('✅ Found functions with generation validation:');
        allFunctions.forEach((func, index) => {
          console.log(`\n--- Function ${index + 1}: ${func.function_name} ---`);
          console.log(func.function_definition);
          console.log('\n');
        });
      } else {
        console.log('❌ No functions found with generation validation');
      }
    }

    // Check for triggers on growth_communities (alternative approach)
    console.log('\n\n4. Checking ALL triggers on growth_communities:');
    console.log('=' .repeat(60));
    
    const { data: allTriggers, error: triggerError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              t.tgname as trigger_name,
              p.proname as function_name,
              pg_get_functiondef(p.oid) as function_definition,
              CASE t.tgtype & 2
                  WHEN 0 THEN 'BEFORE'
                  ELSE 'AFTER'
              END as timing
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_proc p ON t.tgfoid = p.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE c.relname = 'growth_communities'
          AND n.nspname = 'public'
          AND NOT t.tgisinternal;
        `
      });

    if (triggerError) {
      console.error('❌ Error getting triggers:', triggerError);
    } else {
      if (allTriggers && allTriggers.length > 0) {
        console.log('✅ Found triggers:');
        allTriggers.forEach((trigger, index) => {
          console.log(`\n--- Trigger ${index + 1}: ${trigger.trigger_name} ---`);
          console.log('Function:', trigger.function_name);
          console.log('Timing:', trigger.timing);
          console.log('Function definition:');
          console.log(trigger.function_definition);
          console.log('\n');
        });
      } else {
        console.log('❌ No triggers found on growth_communities table');
      }
    }

    // Check the table creation DDL to see if there's something we're missing
    console.log('\n\n5. Checking table definition:');
    console.log('=' .repeat(60));
    
    const { data: tableDef, error: tableError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT 
              column_name,
              data_type,
              is_nullable,
              column_default,
              character_maximum_length
          FROM information_schema.columns
          WHERE table_name = 'growth_communities'
          AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });

    if (tableError) {
      console.error('❌ Error getting table definition:', tableError);
    } else {
      console.log('✅ Table structure:');
      console.table(tableDef);
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Run the search
findConstraintSource();