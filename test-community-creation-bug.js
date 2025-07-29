const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCommunityCreation() {
  console.log('🧪 Testing community creation for Colegio Metodista de Santiago...\n');
  
  // Test creating a community for school ID 10 (Colegio Metodista de Santiago)
  const testData = {
    name: 'Test Community for Andrea',
    school_id: 10,
    generation_id: null,
    created_by: 'b8b2dc3a-8c40-4c10-a97a-8f2e73fdf3f0' // Admin user ID
  };
  
  console.log('📝 Attempting to create community with:', testData);
  
  const { data, error } = await supabase
    .from('growth_communities')
    .insert(testData)
    .select();
  
  if (error) {
    console.log('\n❌ ERROR OCCURRED:');
    console.log('Code:', error.code);
    console.log('Message:', error.message);
    console.log('Details:', error.details);
    console.log('Hint:', error.hint);
    
    // Check if it's a trigger error
    if (error.message && error.message.includes('check_community_organization')) {
      console.log('\n⚠️  This is a TRIGGER ERROR from check_community_organization function');
    }
  } else {
    console.log('\n✅ SUCCESS! Community created:', data);
    
    // Clean up test data
    if (data && data[0]) {
      const { error: deleteError } = await supabase
        .from('growth_communities')
        .delete()
        .eq('id', data[0].id);
      
      if (!deleteError) {
        console.log('🧹 Test data cleaned up');
      }
    }
  }
  
  // Now let's check the current trigger function
  console.log('\n\n🔍 Checking current trigger function...');
  const { data: funcData, error: funcError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT prosrc as function_body
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'check_community_organization'
      AND n.nspname = 'public';
    `
  });
  
  if (funcError) {
    console.error('Error getting function:', funcError);
  } else if (funcData && funcData.length > 0) {
    console.log('\n📋 Current trigger function body:');
    console.log('=' .repeat(80));
    console.log(funcData[0].function_body);
  }
}

testCommunityCreation();