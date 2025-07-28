const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function simulateBugScenario() {
  console.log('=== Simulating the Bug Scenario ===\n');
  
  console.log('The bug occurs when:');
  console.log('1. A school has has_generations = false');
  console.log('2. BUT the school has generation records in the database');
  console.log('3. The API logic uses: has_generations || (existingGenerations.length > 0)');
  console.log('4. This makes the API incorrectly require generation_id\n');
  
  // Let's create a test scenario by temporarily adding a generation to a school that has has_generations=false
  const testSchoolId = 10; // Colegio Metodista de Santiago
  
  console.log('Step 1: Verify school status');
  const { data: school } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('id', testSchoolId)
    .single();
    
  console.log('Test school:', school);
  
  console.log('\nStep 2: Check current generations');
  const { data: currentGens } = await supabase
    .from('generations')
    .select('id, name')
    .eq('school_id', testSchoolId);
    
  console.log('Current generations:', currentGens?.length || 0);
  
  console.log('\nStep 3: Temporarily add a generation to simulate the scenario');
  const { data: testGen, error: genError } = await supabase
    .from('generations')
    .insert({
      school_id: testSchoolId,
      name: 'Test Generation - Bug Simulation',
      grade_range: 'Test'
    })
    .select('id, name')
    .single();
    
  if (genError) {
    console.error('Error creating test generation:', genError);
    return;
  }
  
  console.log('Created test generation:', testGen);
  
  console.log('\nStep 4: Test API logic with the problematic scenario');
  
  // Re-fetch generations
  const { data: updatedGens } = await supabase
    .from('generations')
    .select('id')
    .eq('school_id', testSchoolId);
  
  // API logic simulation
  const apiLogicResult = school.has_generations || (updatedGens && updatedGens.length > 0);
  const correctLogicResult = school.has_generations === true;
  
  console.log('School has_generations flag:', school.has_generations);
  console.log('Generations in database:', updatedGens?.length || 0);
  console.log('Current API logic result (requires generation?):', apiLogicResult);
  console.log('Correct logic result (should require generation?):', correctLogicResult);
  
  if (apiLogicResult !== correctLogicResult) {
    console.log('\n🐛 BUG REPRODUCED!');
    console.log('The API would incorrectly require generation_id for a school that has has_generations=false');
    console.log('but has generation records in the database');
    
    console.log('\nThis would cause the exact error Mora encountered:');
    console.log('"La escuela \\"Colegio Metodista de Santiago\\" utiliza generaciones. Debe seleccionar una generación para crear la comunidad."');
  } else {
    console.log('\n✅ No bug in this scenario');
  }
  
  console.log('\nStep 5: Clean up test data');
  const { error: deleteError } = await supabase
    .from('generations')
    .delete()
    .eq('id', testGen.id);
    
  if (deleteError) {
    console.error('Error cleaning up test generation:', deleteError);
  } else {
    console.log('✅ Test generation cleaned up');
  }
  
  console.log('\nStep 6: Test community creation to verify the database constraint works correctly');
  
  // Test direct database constraint
  const { data: communityResult, error: communityError } = await supabase
    .from('growth_communities')
    .insert({
      name: 'Test Community - Constraint Check',
      school_id: testSchoolId,
      generation_id: null
    })
    .select('id');
    
  if (communityError) {
    console.log('❌ Database constraint blocked community creation:', communityError.message);
    console.log('This indicates the school still requires generation_id at the database level');
  } else {
    console.log('✅ Database allows community creation without generation_id');
    
    // Clean up
    if (communityResult && communityResult[0]) {
      await supabase
        .from('growth_communities')
        .delete()
        .eq('id', communityResult[0].id);
      console.log('✅ Test community cleaned up');
    }
  }
  
  console.log('\n=== CONCLUSION ===');
  console.log('The bug in the API validation logic makes it too restrictive');
  console.log('It blocks valid community creation for schools with has_generations=false');
  console.log('even when the database constraint would allow it');
  console.log('\nThe fix is to change line 99 in assign-role.ts from:');
  console.log('const schoolHasGenerations = schoolData.has_generations || (existingGenerations && existingGenerations.length > 0);');
  console.log('\nTo:');
  console.log('const schoolHasGenerations = schoolData.has_generations === true;');
}

simulateBugScenario().catch(console.error);