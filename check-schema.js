const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  console.log('1. Checking growth_communities table columns...');
  
  // First, let's try to get a sample row to see the structure
  const { data: sample, error: sampleError } = await supabase
    .from('growth_communities')
    .select('*')
    .limit(1);
    
  if (sampleError) {
    console.error('Error getting sample:', sampleError);
  } else {
    console.log('Sample row (to see columns):', sample);
  }

  console.log('\n2. Checking generations table columns...');
  
  const { data: genSample, error: genError } = await supabase
    .from('generations')
    .select('*')
    .limit(1);
    
  if (genError) {
    console.error('Error getting generation sample:', genError);
  } else {
    console.log('Generation sample:', genSample);
  }

  console.log('\n3. Testing community creation with correct columns...');
  
  const { data: insertResult, error: insertError } = await supabase
    .from('growth_communities')
    .insert({
      name: 'Test Community for Metodista',
      school_id: 10,
      generation_id: null
    })
    .select('*');
    
  if (insertError) {
    console.error('Insert error:', insertError);
    console.log('Error details:', JSON.stringify(insertError, null, 2));
  } else {
    console.log('Insert successful:', insertResult);
    
    // Clean up if successful
    if (insertResult && insertResult[0]) {
      const { error: deleteError } = await supabase
        .from('growth_communities')
        .delete()
        .eq('id', insertResult[0].id);
        
      if (deleteError) {
        console.error('Error cleaning up test community:', deleteError);
      } else {
        console.log('Test community cleaned up successfully');
      }
    }
  }
}

checkSchema().catch(console.error);