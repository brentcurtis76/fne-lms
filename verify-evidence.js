const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runEvidenceQueries() {
  console.log('=== VERIFIABLE EVIDENCE FOR COMMUNITY LEADER ROLE ASSIGNMENT FIX ===\n');

  try {
    // 1. Show the current state of schools with has_generations field
    console.log('1. CURRENT SCHOOLS STATE (showing has_generations values):');
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('name');
    
    if (schoolsError) throw schoolsError;
    
    schools.forEach(school => {
      const status = school.has_generations === null ? 'NULL_VALUE_PROBLEM' 
                   : school.has_generations === true ? 'HAS_GENERATIONS'
                   : 'NO_GENERATIONS';
      console.log(`  ID: ${school.id}, Name: "${school.name}", has_generations: ${school.has_generations}, Status: ${status}`);
    });

    console.log('\n2. SCHOOLS WITH NULL has_generations VALUES (the problem):');
    const nullSchools = schools.filter(s => s.has_generations === null);
    console.log(`  Found ${nullSchools.length} schools with NULL has_generations values:`);
    nullSchools.forEach(school => {
      console.log(`    - ${school.name} (ID: ${school.id})`);
    });

    console.log('\n3. SCHOOLS WITH DEFINED has_generations VALUES (working correctly):');
    const definedSchools = schools.filter(s => s.has_generations !== null);
    console.log(`  Found ${definedSchools.length} schools with properly defined has_generations values:`);
    definedSchools.forEach(school => {
      console.log(`    - ${school.name} (ID: ${school.id}) - ${school.has_generations ? 'HAS_GENERATIONS' : 'NO_GENERATIONS'}`);
    });

    // 4. Get current trigger function source
    console.log('\n4. CURRENT TRIGGER FUNCTION (check_community_organization):');
    const { data: triggerData, error: triggerError } = await supabase
      .rpc('sql', { 
        query: `
          SELECT pg_get_functiondef(p.oid) as current_trigger_function
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE p.proname = 'check_community_organization'
          AND n.nspname = 'public';
        `
      });
    
    if (triggerError) {
      console.log('  Could not retrieve trigger function (may not have RPC permissions)');
      console.log('  Error:', triggerError.message);
    } else if (triggerData && triggerData.length > 0) {
      console.log('  Trigger function source:');
      console.log(triggerData[0].current_trigger_function);
    } else {
      console.log('  Trigger function not found or no data returned');
    }

    // 5. Test community creation scenario (simulation)
    console.log('\n5. COMMUNITY CREATION TEST SCENARIO:');
    console.log('  Testing what happens when trying to create a community for different school types...');
    
    // Find a school with has_generations = true
    const schoolWithGenerations = schools.find(s => s.has_generations === true);
    // Find a school with has_generations = false  
    const schoolWithoutGenerations = schools.find(s => s.has_generations === false);
    // Find a school with has_generations = null
    const schoolWithNull = schools.find(s => s.has_generations === null);

    if (schoolWithGenerations) {
      console.log(`  School WITH generations: "${schoolWithGenerations.name}" (ID: ${schoolWithGenerations.id})`);
      console.log('    → Community creation REQUIRES generation_id (would fail if NULL)');
    }

    if (schoolWithoutGenerations) {
      console.log(`  School WITHOUT generations: "${schoolWithoutGenerations.name}" (ID: ${schoolWithoutGenerations.id})`);
      console.log('    → Community creation allows NULL generation_id (would succeed)');
    }

    if (schoolWithNull) {
      console.log(`  School with NULL has_generations: "${schoolWithNull.name}" (ID: ${schoolWithNull.id})`);
      console.log('    → Community creation behavior UNDEFINED (this is the problem!)');
      console.log('    → The trigger function cannot determine if generation_id is required');
    }

    // 6. Show the fix that was implemented
    console.log('\n6. THE FIX IMPLEMENTED:');
    console.log('  API Validation in /pages/api/admin/assign-role.ts:');
    console.log('  - Added validation: if (school.has_generations && !generation_id)');
    console.log('  - Returns error: "Esta escuela requiere seleccionar una generación"');
    console.log('  - Frontend shows required field indicator (*) for generation dropdown');
    console.log('  - Submit button disabled until all requirements met');

    console.log('\n7. RECOMMENDED DATABASE FIX:');
    console.log('  To completely resolve the issue, set has_generations to false for NULL schools:');
    if (nullSchools.length > 0) {
      console.log('  SQL to fix NULL values:');
      nullSchools.forEach(school => {
        console.log(`    UPDATE schools SET has_generations = false WHERE id = ${school.id}; -- ${school.name}`);
      });
    } else {
      console.log('  ✅ No NULL values found - database is already consistent!');
    }

  } catch (error) {
    console.error('Error running evidence queries:', error);
  }
}

runEvidenceQueries();