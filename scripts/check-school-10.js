const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchool10() {
  console.log('=== SCHOOL 10 ANALYSIS ===');
  
  // Check school 10 details
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('id', 10)
    .single();
    
  if (schoolError) {
    console.log('Error fetching school 10:', schoolError.message);
    return;
  }
  
  console.log('School 10 details:', school);
  
  // Check generations for school 10
  const { data: generations, error: genError } = await supabase
    .from('generations')
    .select('id, name')
    .eq('school_id', 10);
    
  if (genError) {
    console.log('Error fetching generations:', genError.message);
  } else {
    console.log('Generations for school 10:', generations);
    console.log('Generation count:', generations.length);
  }
  
  // Check if any communities already exist for school 10
  const { data: communities, error: commError } = await supabase
    .from('growth_communities')
    .select('id, name, generation_id')
    .eq('school_id', 10);
    
  if (commError) {
    console.log('Error fetching communities:', commError.message);
  } else {
    console.log('Existing communities for school 10:', communities);
  }
  
  console.log('\n=== TRIGGER ANALYSIS ===');
  console.log('Based on enhanced trigger logic:');
  if (!school.has_generations || school.has_generations === null) {
    console.log('✓ Community creation SHOULD be allowed (has_generations is false/null)');
  } else if (generations.length === 0) {
    console.log('✓ Community creation SHOULD be allowed (no generations in database)');
  } else {
    console.log('✗ Community creation SHOULD require generation_id (has generations and has_generations=true)');
  }
  
  // Test with different schools that have generations
  console.log('\n=== TESTING OTHER SCHOOLS ===');
  
  const { data: schoolsWithGens, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('has_generations', true)
    .limit(3);
    
  if (schoolsError) {
    console.log('Error fetching schools with generations:', schoolsError.message);
  } else {
    console.log('Schools with has_generations=true:', schoolsWithGens);
    
    // Test community creation for first school with generations
    if (schoolsWithGens.length > 0) {
      const testSchool = schoolsWithGens[0];
      console.log(`\nTesting community creation for school ${testSchool.id} (${testSchool.name})...`);
      
      try {
        const { data: testResult, error: testError } = await supabase
          .from('growth_communities')
          .insert({
            name: 'Test Enhanced Trigger Function - School with Gens',
            school_id: testSchool.id,
            generation_id: null,
            description: 'Test community for enhanced trigger validation'
          })
          .select();

        if (testError) {
          if (testError.message && testError.message.includes('utiliza generaciones')) {
            console.log('✅ Trigger correctly blocked creation - requires generation_id');
          } else {
            console.log('Unexpected error:', testError.message);
          }
        } else {
          console.log('⚠️ Community created unexpectedly - trigger may not be working');
          // Clean up
          await supabase
            .from('growth_communities')
            .delete()
            .eq('name', 'Test Enhanced Trigger Function - School with Gens');
          console.log('Test community cleaned up');
        }
      } catch (error) {
        console.log('Test error:', error.message);
      }
    }
  }
}

checkSchool10();