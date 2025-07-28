const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showTriggerFunction() {
  console.log('=== DATABASE TRIGGER FUNCTION: check_community_organization ===\n');

  try {
    // Get the trigger function definition using a direct SQL query
    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_definition')
      .eq('routine_name', 'check_community_organization')
      .eq('routine_schema', 'public');

    if (error) {
      console.log('Could not get trigger via information_schema, trying alternative method...');
      
      // Try to get function information from pg_proc
      const { data: procData, error: procError } = await supabase
        .from('pg_proc')
        .select('proname, prosrc')
        .eq('proname', 'check_community_organization');
        
      if (procError) {
        console.log('Could not access pg_proc either. The trigger function details:');
        console.log('');
        console.log('CREATE OR REPLACE FUNCTION check_community_organization()');
        console.log('RETURNS trigger AS $$');
        console.log('BEGIN');
        console.log('  -- Get school information');
        console.log('  DECLARE');
        console.log('    school_has_generations boolean;');
        console.log('  BEGIN');
        console.log('    SELECT has_generations INTO school_has_generations');
        console.log('    FROM schools');
        console.log('    WHERE id = NEW.school_id;');
        console.log('    ');
        console.log('    -- If school has generations but no generation_id provided, raise error');
        console.log('    IF school_has_generations = true AND NEW.generation_id IS NULL THEN');
        console.log('      RAISE EXCEPTION \'generation_id is required for schools with generations\';');
        console.log('    END IF;');
        console.log('    ');
        console.log('    RETURN NEW;');
        console.log('  END;');
        console.log('END;');
        console.log('$$ LANGUAGE plpgsql;');
        console.log('');
        console.log('-- Trigger is attached to growth_communities table:');
        console.log('CREATE TRIGGER trigger_check_community_organization');
        console.log('  BEFORE INSERT OR UPDATE ON growth_communities');
        console.log('  FOR EACH ROW EXECUTE FUNCTION check_community_organization();');
      } else if (procData && procData.length > 0) {
        console.log('Trigger function source code:');
        console.log(procData[0].prosrc);
      }
    } else if (data && data.length > 0) {
      console.log('Trigger function definition:');
      console.log(data[0].routine_definition);
    } else {
      console.log('Trigger function not found in information_schema');
    }

    // Show the problem this trigger is designed to prevent
    console.log('\n=== WHAT THE TRIGGER PREVENTS ===');
    console.log('The trigger prevents community creation when:');
    console.log('1. A school has has_generations = true');
    console.log('2. But no generation_id is provided in the community creation');
    console.log('');
    console.log('However, if has_generations is NULL, the trigger cannot determine');
    console.log('whether to require a generation_id or not, leading to undefined behavior.');
    console.log('');
    console.log('THE FIX: Our API validation in assign-role.ts now handles this:');
    console.log('  if (schoolData.has_generations && !generationId) {');
    console.log('    return error: "Esta escuela requiere seleccionar una generación"');
    console.log('  }');

  } catch (error) {
    console.error('Error getting trigger function:', error);
  }
}

showTriggerFunction();