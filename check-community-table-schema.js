const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTableSchema() {
  console.log('📊 Checking growth_communities table schema...\n');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'growth_communities'
      ORDER BY ordinal_position;
    `
  });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.table(data);
  }
  
  // Now test creating a community without created_by
  console.log('\n\n🧪 Testing community creation without created_by...');
  const testData = {
    name: 'Test Community for Andrea',
    school_id: 10,
    generation_id: null
  };
  
  console.log('📝 Attempting to create community with:', testData);
  
  const { data: createData, error: createError } = await supabase
    .from('growth_communities')
    .insert(testData)
    .select();
  
  if (createError) {
    console.log('\n❌ ERROR OCCURRED:');
    console.log('Code:', createError.code);
    console.log('Message:', createError.message);
    console.log('Details:', createError.details);
    console.log('Hint:', createError.hint);
  } else {
    console.log('\n✅ SUCCESS! Community created:', createData);
    
    // Clean up test data
    if (createData && createData[0]) {
      const { error: deleteError } = await supabase
        .from('growth_communities')
        .delete()
        .eq('id', createData[0].id);
      
      if (!deleteError) {
        console.log('🧹 Test data cleaned up');
      }
    }
  }
}

checkTableSchema();