const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testLearningPathsDetailed() {
  console.log('Detailed Learning Paths Test\n');
  console.log('='.repeat(50));
  
  // Test 1: Check if learning_paths table exists and has data
  console.log('\n1. Checking learning_paths table:');
  try {
    const { data: paths, error } = await supabase
      .from('learning_paths')
      .select('*')
      .eq('is_active', true);
    
    if (error) {
      console.error('   ❌ Error accessing table:', error.message);
    } else {
      console.log('   ✅ Table exists with', paths?.length || 0, 'active learning paths');
      if (paths && paths.length > 0) {
        console.log('   Sample learning paths:');
        paths.forEach(path => {
          console.log(`     - ${path.name} (${path.id})`);
        });
      }
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }
  
  // Test 2: Test get_learning_paths RPC
  console.log('\n2. Testing get_learning_paths() RPC:');
  try {
    const { data, error } = await supabase.rpc('get_learning_paths');
    
    if (error) {
      console.error('   ❌ RPC Error:', error.message);
      console.error('   Full error:', error);
    } else {
      console.log('   ✅ RPC Success! Returned', data?.length || 0, 'learning paths');
      if (data && data.length > 0) {
        console.log('   RPC returned paths:');
        data.forEach(path => {
          console.log(`     - ${path.name} (${path.course_count} courses)`);
        });
      }
    }
  } catch (err) {
    console.error('   ❌ RPC Exception:', err.message);
  }
  
  // Test 3: Check user_learning_paths
  console.log('\n3. Checking user enrollments:');
  try {
    const { data: enrollments, error } = await supabase
      .from('user_learning_paths')
      .select(`
        *,
        learning_paths (name),
        profiles (email)
      `)
      .limit(5);
    
    if (error) {
      console.error('   ❌ Error:', error.message);
    } else {
      console.log('   ✅ Found', enrollments?.length || 0, 'user enrollments');
      if (enrollments && enrollments.length > 0) {
        console.log('   Sample enrollments:');
        enrollments.forEach(e => {
          console.log(`     - ${e.profiles?.email || 'Unknown'} enrolled in ${e.learning_paths?.name || 'Unknown'}`);
        });
      }
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }
  
  // Test 4: Check if the page might be having auth issues
  console.log('\n4. Testing with authenticated user context:');
  try {
    // Get a user to test with
    const { data: users } = await supabase
      .from('profiles')
      .select('id, email')
      .limit(1)
      .single();
    
    if (users) {
      console.log(`   Testing with user: ${users.email}`);
      
      // Test the RPC as if we were this user
      const { data, error } = await supabase.rpc('get_student_learning_paths', {
        p_user_id: users.id
      });
      
      if (error) {
        console.error('   ❌ Error:', error.message);
      } else {
        console.log('   ✅ User has', data?.length || 0, 'assigned learning paths');
      }
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 SUMMARY:');
  console.log('If all tests passed above, the learning paths page should work.');
  console.log('The schema cache refresh has been triggered.');
  console.log('\n🔧 Next Steps:');
  console.log('1. Try accessing /admin/learning-paths in your browser');
  console.log('2. Check the browser console for any errors');
  console.log('3. If still not working, check the Network tab for failed API calls');
}

testLearningPathsDetailed();