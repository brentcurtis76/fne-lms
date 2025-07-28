const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

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
  
  // Current API logic (the bug)
  const currentApiLogic = metodista.has_generations || (metodistaGenerations && metodistaGenerations.length > 0);
  console.log('\nCurrent API logic (has_generations || existingGenerations.length > 0):');
  console.log('  - has_generations:', metodista.has_generations);
  console.log('  - existingGenerations.length > 0:', metodistaGenerations && metodistaGenerations.length > 0);
  console.log('  - Result (requires generation?):', currentApiLogic);
  
  // Correct logic (what it should be)
  const correctLogic = metodista.has_generations === true;
  console.log('\nCorrect logic (has_generations === true):');
  console.log('  - Result (requires generation?):', correctLogic);
  
  console.log('\nExpected behavior: Should NOT require generation_id');
  console.log('Current behavior:', currentApiLogic ? '❌ REQUIRES generation_id (BUG!)' : '✅ Does not require generation_id');
  console.log('Correct behavior:', correctLogic ? '❌ Would require generation_id' : '✅ Would not require generation_id');
  
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
  
  const fneCurrentLogic = fne.has_generations || (fneGenerations && fneGenerations.length > 0);
  const fneCorrectLogic = fne.has_generations === true;
  
  console.log('\nCurrent API logic result:', fneCurrentLogic);
  console.log('Correct logic result:', fneCorrectLogic);
  console.log('Both should require generation_id:', fneCurrentLogic === fneCorrectLogic ? '✅ CORRECT' : '❌ INCORRECT');
  
  // Test 3: Find all problematic cases
  console.log('\n\nTest 3: Finding all problematic schools');
  console.log('----------------------------------------');
  
  const { data: allSchools } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .order('id');
    
  let problematicCount = 0;
  
  for (const school of allSchools || []) {
    const { data: gens } = await supabase
      .from('generations')
      .select('id')
      .eq('school_id', school.id);
      
    const hasGenerationsInDB = gens && gens.length > 0;
    const currentLogicResult = school.has_generations || hasGenerationsInDB;
    const correctLogicResult = school.has_generations === true;
    
    if (currentLogicResult !== correctLogicResult) {
      if (problematicCount === 0) {
        console.log('⚠️ Schools where current API logic differs from correct logic:');
      }
      problematicCount++;
      console.log(`  - ${school.name} (ID: ${school.id})`);
      console.log(`    - has_generations flag: ${school.has_generations}`);
      console.log(`    - Generations in DB: ${gens?.length || 0}`);
      console.log(`    - Current API would require generation: ${currentLogicResult}`);
      console.log(`    - Should require generation: ${correctLogicResult}`);
    }
  }
  
  if (problematicCount === 0) {
    console.log('✅ No problematic schools found with current data');
  } else {
    console.log(`\n⚠️ Total problematic schools: ${problematicCount}`);
  }
  
  // Summary
  console.log('\n\n=== SUMMARY ===');
  console.log('The bug is in the API validation logic at line 99-100 of /pages/api/admin/assign-role.ts:');
  console.log('\nCURRENT (BUGGY) CODE:');
  console.log('const schoolHasGenerations = schoolData.has_generations || (existingGenerations && existingGenerations.length > 0);');
  console.log('\nThis makes the API require generation_id for ANY school that has generations in the database,');
  console.log('even if the school has has_generations=false');
  console.log('\nCORRECT CODE SHOULD BE:');
  console.log('const schoolHasGenerations = schoolData.has_generations === true;');
  console.log('\nThis would only require generation_id for schools explicitly marked as using generations');
}

testAPIValidation().catch(console.error);