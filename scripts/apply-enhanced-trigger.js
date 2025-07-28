const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const enhancedTriggerSQL = `
-- Enhanced Community Organization Trigger  
CREATE OR REPLACE FUNCTION "public"."check_community_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  school_record RECORD;
  generation_count INTEGER;
BEGIN
  -- Get school information in one query
  SELECT id, name, has_generations 
  INTO school_record
  FROM schools 
  WHERE id = NEW.school_id;
  
  -- Validate school exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid school_id: school does not exist';
  END IF;
  
  -- If generation_id is provided, validate it exists and belongs to this school
  IF NEW.generation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM generations 
      WHERE id = NEW.generation_id 
      AND school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Invalid generation_id: generation does not exist or does not belong to school "%"', school_record.name;
    END IF;
    RETURN NEW;
  END IF;
  
  -- If generation_id is NULL, determine if this is allowed
  -- Count actual generations for this school
  SELECT COUNT(*) INTO generation_count
  FROM generations 
  WHERE school_id = NEW.school_id;
  
  -- Allow NULL generation_id if:
  -- 1. School has no generations in database, OR
  -- 2. School has has_generations explicitly set to false (even if it has generation records)
  -- 3. School has has_generations set to NULL (treat as false for backward compatibility)
  IF generation_count = 0 OR 
     school_record.has_generations = false OR 
     school_record.has_generations IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- If we get here, the school has generations and requires generation_id
  RAISE EXCEPTION 'La escuela "%" utiliza generaciones. Debe especificar una generación para crear la comunidad.', school_record.name;
END;
$$;
`;

const testSQL = `
-- Test the enhanced trigger
SELECT 'Testing enhanced trigger function...' as status;

-- Test 1: Insert with NULL generation_id for school 10 (should trigger appropriate response)
INSERT INTO growth_communities (name, school_id, generation_id, description)
VALUES ('Test Enhanced Trigger Function', 10, NULL, 'Test community for enhanced trigger validation')
RETURNING id, name, school_id, generation_id;
`;

const cleanupSQL = `
-- Clean up test
DELETE FROM growth_communities WHERE name = 'Test Enhanced Trigger Function';
SELECT 'Test cleanup completed' as status;
`;

async function applyEnhancedTrigger() {
  try {
    console.log('Applying enhanced trigger function...');
    
    // Since we can't execute DDL via RPC, let's save the SQL to a file for manual execution
    const fs = require('fs');
    const path = require('path');
    
    const sqlFilePath = path.join(__dirname, 'enhanced-trigger.sql');
    
    const fullSQL = `
-- Enhanced Community Organization Trigger Application
-- Execute this in Supabase SQL Editor or database admin tool

${enhancedTriggerSQL}

-- Test the enhanced trigger function
SELECT 'Enhanced trigger function created successfully' as status;

-- Verify the trigger exists
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table, 
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'validate_community_organization';
`;

    fs.writeFileSync(sqlFilePath, fullSQL);
    console.log(`✅ SQL file written to: ${sqlFilePath}`);
    console.log('\nTo apply the enhanced trigger:');
    console.log('1. Open Supabase Dashboard SQL Editor');
    console.log('2. Copy and execute the SQL from the file above');
    console.log('3. Or use psql command line with the file');
    
    // Let's try a different approach - check if we can at least verify the current trigger
    console.log('\nChecking current trigger status...');
    
    const { data: triggerInfo, error: triggerError } = await supabase
      .from('information_schema.triggers')
      .select('trigger_name, event_manipulation, event_object_table')
      .eq('trigger_name', 'validate_community_organization');

    if (triggerError) {
      console.log('Cannot query trigger info via Supabase client');
    } else {
      console.log('Current trigger info:', triggerInfo);
    }

    // Test community creation to see current behavior
    console.log('\nTesting current community creation behavior...');
    
    try {
      // Get a test profile
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      if (profiles && profiles.length > 0) {
        const testProfileId = profiles[0].id;
        
        // Try to create a test community for school 10 without generation_id
        const { data: testResult, error: testError } = await supabase
          .from('growth_communities')
          .insert({
            name: 'Test Enhanced Trigger Function',
            school_id: 10,
            generation_id: null,
            description: 'Test community for enhanced trigger validation'
          })
          .select();

        if (testError) {
          if (testError.message && testError.message.includes('utiliza generaciones')) {
            console.log('✅ Current trigger correctly requires generation_id for schools with generations');
            console.log('Enhanced trigger may already be in place or similar logic exists');
          } else {
            console.log('Current trigger error:', testError.message);
          }
        } else {
          console.log('Test community created - cleaning up...');
          // Clean up
          await supabase
            .from('growth_communities')
            .delete()
            .eq('name', 'Test Enhanced Trigger Function');
          console.log('✅ Test completed - community creation allowed');
        }
      }

    } catch (error) {
      console.log('Test error:', error.message);
    }

    console.log('\n📝 MANUAL STEPS REQUIRED:');
    console.log('1. Execute the SQL in enhanced-trigger.sql file via Supabase Dashboard');
    console.log('2. The enhanced trigger will provide better error messages and logic');
    console.log('3. Current trigger behavior has been tested above');

  } catch (error) {
    console.error('Error during trigger application:', error);
  }
}

applyEnhancedTrigger();