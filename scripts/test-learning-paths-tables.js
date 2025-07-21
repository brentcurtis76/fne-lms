const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testLearningPathsTables() {
  console.log('Testing Learning Paths tables...\n');

  try {
    // Test 1: Check if learning_paths table exists
    console.log('1. Testing learning_paths table...');
    const { data: paths, error: pathsError } = await supabase
      .from('learning_paths')
      .select('*')
      .limit(1);
    
    if (pathsError) {
      console.error('❌ learning_paths table error:', pathsError.message);
    } else {
      console.log('✅ learning_paths table exists');
    }

    // Test 2: Check if learning_path_courses table exists
    console.log('\n2. Testing learning_path_courses table...');
    const { data: courses, error: coursesError } = await supabase
      .from('learning_path_courses')
      .select('*')
      .limit(1);
    
    if (coursesError) {
      console.error('❌ learning_path_courses table error:', coursesError.message);
    } else {
      console.log('✅ learning_path_courses table exists');
    }

    // Test 3: Check if learning_path_assignments table exists
    console.log('\n3. Testing learning_path_assignments table...');
    const { data: assignments, error: assignmentsError } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .limit(1);
    
    if (assignmentsError) {
      console.error('❌ learning_path_assignments table error:', assignmentsError.message);
    } else {
      console.log('✅ learning_path_assignments table exists');
    }

    // Test 4: Try the query from getUserAssignedPaths
    console.log('\n4. Testing getUserAssignedPaths query...');
    const testUserId = '123e4567-e89b-12d3-a456-426614174000'; // dummy user ID
    
    const { data: userAssignments, error: userAssignmentsError } = await supabase
      .from('learning_path_assignments')
      .select(`
        *,
        path:learning_paths(*)
      `)
      .or(`user_id.eq.${testUserId},group_id.in.(
        SELECT community_id FROM user_roles WHERE user_id = '${testUserId}' AND is_active = true
      )`);
    
    if (userAssignmentsError) {
      console.error('❌ getUserAssignedPaths query error:', userAssignmentsError.message);
      console.error('   Details:', userAssignmentsError);
    } else {
      console.log('✅ getUserAssignedPaths query works');
      console.log(`   Found ${userAssignments?.length || 0} assignments`);
    }

    // Test 5: Check if RPC functions exist
    console.log('\n5. Testing RPC functions...');
    const rpcFunctions = [
      'create_full_learning_path',
      'update_full_learning_path',
      'batch_assign_learning_path'
    ];

    for (const funcName of rpcFunctions) {
      try {
        // Try to get function definition (this will fail with specific error if function doesn't exist)
        const { data, error } = await supabase.rpc(funcName, {});
        if (error && error.message.includes('does not exist')) {
          console.error(`❌ RPC function '${funcName}' does not exist`);
        } else if (error && error.message.includes('required')) {
          console.log(`✅ RPC function '${funcName}' exists (parameter validation error is expected)`);
        } else {
          console.log(`✅ RPC function '${funcName}' exists`);
        }
      } catch (e) {
        console.error(`❌ RPC function '${funcName}' error:`, e.message);
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testLearningPathsTables();