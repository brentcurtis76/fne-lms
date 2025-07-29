const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simulateApiCall() {
  console.log('🔍 Simulating the exact API logic...\n');

  // Simulate the API parameters
  const targetUserId = '3df3c0c2-0c00-4bb6-92f8-d5a83c9c7a8f'; // Example user ID
  const roleType = 'lider_comunidad';
  const schoolId = 10; // Colegio Metodista de Santiago
  const generationId = null;
  const communityId = null;
  const currentUserId = 'b8b2dc3a-8c40-4c10-a97a-8f2e73fdf3f0'; // Admin user

  // Get user info for community name
  console.log('1. Getting user info...');
  const { data: userData, error: userError } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', targetUserId)
    .single();

  if (userError) {
    console.error('User error:', userError);
    // Let's create a dummy user name
    console.log('Using dummy user name for test');
  }

  const firstName = userData?.first_name || 'Andrea';
  const lastName = userData?.last_name || 'Met';

  // Check if school requires generations
  console.log('\n2. Checking school info...');
  const { data: schoolData, error: schoolError } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('id', schoolId)
    .single();

  if (schoolError || !schoolData) {
    console.error('School error:', schoolError);
    return;
  }

  console.log('School data:', schoolData);

  // Check if school has any generations in the database
  console.log('\n3. Checking existing generations...');
  const { data: existingGenerations, error: genError } = await supabase
    .from('generations')
    .select('id')
    .eq('school_id', schoolId)
    .limit(1);

  if (genError) {
    console.error('Error checking generations:', genError);
    return;
  }

  console.log('Existing generations:', existingGenerations);

  const schoolHasGenerations = schoolData.has_generations === true;

  // Validate generation requirement
  console.log('\n4. Validation logic:');
  console.log('- School has_generations flag:', schoolHasGenerations);
  console.log('- Generation ID provided:', generationId);
  
  if (schoolHasGenerations && !generationId) {
    console.log('❌ VALIDATION FAILED: School requires generation but none provided');
    console.log(`Error message would be: La escuela "${schoolData.name}" utiliza generaciones. Debe seleccionar una generación para crear la comunidad.`);
    return;
  }

  const communityName = `Comunidad ${firstName} ${lastName}`;

  // Create the community with proper validation
  console.log('\n5. Attempting to create community...');
  console.log('Community name:', communityName);
  console.log('Data to insert:', {
    name: communityName,
    school_id: schoolId,
    generation_id: generationId || null
  });

  const { data: newCommunity, error: communityError } = await supabase
    .from('growth_communities')
    .insert({
      name: communityName,
      school_id: schoolId,
      generation_id: generationId || null
    })
    .select()
    .single();

  if (communityError) {
    console.error('\n❌ Error creating community:', communityError);
    console.log('Error code:', communityError.code);
    console.log('Error message:', communityError.message);
    
    // Check specific error types
    if (communityError.code === '23505') {
      console.log('→ Unique constraint violation');
    } else if (communityError.code === '23503') {
      console.log('→ Foreign key constraint violation');
    } else if (communityError.message && communityError.message.includes('generation_id is required')) {
      console.log('→ Custom trigger error');
    }
  } else {
    console.log('\n✅ Community created successfully:', newCommunity);
    
    // Clean up
    if (newCommunity) {
      await supabase
        .from('growth_communities')
        .delete()
        .eq('id', newCommunity.id);
      console.log('🧹 Test data cleaned up');
    }
  }
}

simulateApiCall();