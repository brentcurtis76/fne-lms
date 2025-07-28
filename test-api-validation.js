const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Ffcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAPIValidation() {
  console.log('=== Testing API Validation Logic ===\n');
  
  // Test 1: Colegio Metodista de Santiago (has_generations = false)
  console.log('Test 1: Colegio Metodista de Santiago (has_generations = false)');
  console.log('------------------------------------------------------');
  
  const { data: metodista } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('id', 10)
    .single();
  
  console.log('School:', metodista);
  
  // Check if school has any generations in database
  const { data: metodistaGenerations } = await supabase
    .from('generations')
    .select('id')
    .eq('school_id', 10);
    
  console.log('Generations in database:', metodistaGenerations?.length || 0);
  
  // API logic simulation
  const apiLogicHasGenerations = metodista.has_generations || (metodistaGenerations && metodistaGenerations.length > 0);
  console.log('API would determine schoolHasGenerations:', apiLogicHasGenerations);
  console.log('API would require generation_id:', apiLogicHasGenerations);
  console.log('Expected: Should NOT require generation_id (false)');
  console.log('Result:', apiLogicHasGenerations === false ? '✅ CORRECT' : '❌ INCORRECT - This is the bug!');
  
  // Test 2: Fundación Nueva Educación (has_generations = true)
  console.log('\n\nTest 2: Fundación Nueva Educación (has_generations = true)');
  console.log('--------------------------------------------------------');
  
  const { data: fne } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('id', 19)
    .single();
  
  console.log('School:', fne);
  
  const { data: fneGenerations } = await supabase
    .from('generations')
    .select('id')
    .eq('school_id', 19);
    
  console.log('Generations in database:', fneGenerations?.length || 0);
  
  const fneApiLogicHasGenerations = fne.has_generations || (fneGenerations && fneGenerations.length > 0);
  console.log('API would determine schoolHasGenerations:', fneApiLogicHasGenerations);
  console.log('API would require generation_id:', fneApiLogicHasGenerations);
  console.log('Expected: Should require generation_id (true)');
  console.log('Result:', fneApiLogicHasGenerations === true ? '✅ CORRECT' : '❌ INCORRECT');
  
  // Test 3: Schools with has_generations=false but generations in DB
  console.log('\n\nTest 3: Schools with has_generations=false but have generations in DB');
  console.log('--------------------------------------------------------------------');
  
  const { data: mixedSchools } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('has_generations', false);
    
  let problematicSchools = [];
  
  for (const school of mixedSchools || []) {
    const { data: gens } = await supabase
      .from('generations')
      .select('id')
      .eq('school_id', school.id);
      
    if (gens && gens.length > 0) {
      problematicSchools.push({
        ...school,
        generationCount: gens.length
      });
    }
  }
  
  if (problematicSchools.length > 0) {
    console.log('⚠️ Found schools with inconsistent data:');
    problematicSchools.forEach(school => {
      console.log(`  - ${school.name} (ID: ${school.id}): has_generations=false but has ${school.generationCount} generations`);
    });
    console.log('\nThese schools would incorrectly require generation_id with current API logic!');
  } else {
    console.log('✅ No schools found with inconsistent generation flags');
  }
  
  // Summary
  console.log('\n\n=== SUMMARY ===');
  console.log('The current API logic uses: has_generations || (existingGenerations.length > 0)');
  console.log('This means ANY school with generations in the database will require generation_id');
  console.log('Even if the school has has_generations=false');
  console.log('\nThe correct logic should be: has_generations === true');
  console.log('Only schools explicitly marked as using generations should require generation_id');
}

testAPIValidation().catch(console.error);