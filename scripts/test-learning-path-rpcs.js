const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testLearningPathRPCs() {
  console.log('Testing Learning Path RPC Functions...\n');
  
  // Test 1: get_learning_paths
  console.log('1. Testing get_learning_paths RPC:');
  try {
    const { data, error } = await supabase.rpc('get_learning_paths');
    if (error) {
      console.error('   ❌ Error:', error.message);
    } else {
      console.log('   ✅ Success! Found', data?.length || 0, 'learning paths');
      if (data && data.length > 0) {
        console.log('   Sample path:', data[0].name);
      }
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }
  
  // Test 2: get_student_learning_paths (requires a user_id)
  console.log('\n2. Testing get_student_learning_paths RPC:');
  try {
    // Get a sample user ID
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (users && users.length > 0) {
      const userId = users[0].id;
      const { data, error } = await supabase.rpc('get_student_learning_paths', {
        p_user_id: userId
      });
      
      if (error) {
        console.error('   ❌ Error:', error.message);
      } else {
        console.log('   ✅ Success! User has', data?.length || 0, 'assigned learning paths');
      }
    } else {
      console.log('   ⚠️  No users found to test with');
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }
  
  // Test 3: Check if functions exist in database
  console.log('\n3. Checking function existence in database:');
  try {
    const { data: functions } = await supabase
      .from('pg_proc')
      .select('proname')
      .or('proname.eq.get_learning_paths,proname.eq.get_student_learning_paths')
      .limit(10);
    
    if (functions && functions.length > 0) {
      console.log('   ✅ Functions found in pg_proc:', functions.map(f => f.proname).join(', '));
    } else {
      // Try alternative query
      const { data: altData, error: altError } = await supabase
        .rpc('get_learning_paths')
        .limit(1);
      
      if (!altError) {
        console.log('   ✅ Functions are accessible via RPC');
      } else {
        console.log('   ❌ Functions not directly accessible');
      }
    }
  } catch (err) {
    console.log('   ℹ️  Cannot query pg_proc directly (expected)');
  }
  
  console.log('\n📝 Summary:');
  console.log('If the RPC calls above succeeded, the learning paths page should work.');
  console.log('If they failed, we may need to recreate the functions or check permissions.');
}

testLearningPathRPCs();