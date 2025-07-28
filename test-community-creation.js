const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testCommunityCreation() {
  console.log('1. Checking existing communities for Colegio Metodista de Santiago (school_id = 10)...');
  
  const { data: existingCommunities, error: checkError } = await supabase
    .from('growth_communities')
    .select('id, name, school_id, generation_id')
    .eq('school_id', 10)
    .order('created_at', { ascending: false });
    
  if (checkError) {
    console.error('Error checking communities:', checkError);
  } else {
    console.log('Existing communities:', JSON.stringify(existingCommunities, null, 2));
  }

  console.log('\n2. Attempting to insert community without generation_id...');
  
  // First get a valid user ID
  const { data: user } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .single();
    
  if (!user) {
    console.error('No user found');
    return;
  }

  const { data: insertResult, error: insertError } = await supabase
    .from('growth_communities')
    .insert({
      name: 'Test Community',
      school_id: 10,
      generation_id: null,
      created_by: user.id
    })
    .select('id, name, school_id, generation_id');
    
  if (insertError) {
    console.error('Insert error:', insertError);
    console.log('Error details:', JSON.stringify(insertError, null, 2));
  } else {
    console.log('Insert successful:', insertResult);
  }

  console.log('\n3. Checking school has_generations flag...');
  
  const { data: schoolInfo, error: schoolError } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .eq('id', 10)
    .single();
    
  if (schoolError) {
    console.error('Error checking school:', schoolError);
  } else {
    console.log('School info:', schoolInfo);
  }

  // Let's also check what generations exist for this school
  console.log('\n4. Checking available generations for this school...');
  
  const { data: generations, error: genError } = await supabase
    .from('generations')
    .select('id, name, year')
    .eq('school_id', 10)
    .order('year', { ascending: false });
    
  if (genError) {
    console.error('Error checking generations:', genError);
  } else {
    console.log('Available generations:', JSON.stringify(generations, null, 2));
  }
}

testCommunityCreation().catch(console.error);