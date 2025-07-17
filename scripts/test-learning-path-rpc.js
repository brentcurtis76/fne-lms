#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRPCFunction() {
  console.log('🧪 Testing create_full_learning_path RPC function...\n');

  // First, let's check if the function exists
  const { data: functions, error: listError } = await supabase
    .rpc('pg_proc')
    .select('proname')
    .eq('proname', 'create_full_learning_path');

  console.log('Function check:', { functions, listError });

  // Test user ID (you - Brent)
  const testUserId = '40aff5c7-90de-4be0-ade3-dcb93bca7e3d';

  // Try to call the function with minimal parameters
  console.log('\n📞 Calling RPC function with test parameters...');
  
  const testParams = {
    p_name: 'Test Learning Path',
    p_description: 'This is a test learning path',
    p_course_ids: [], // Empty array for now
    p_created_by: testUserId
  };

  console.log('Parameters:', testParams);

  const { data, error } = await supabase
    .rpc('create_full_learning_path', testParams);

  if (error) {
    console.error('\n❌ RPC Error:', error);
    console.error('Error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
  } else {
    console.log('\n✅ Success! Created learning path:', data);
  }

  // Also test if we can see the function definition
  console.log('\n📋 Checking function existence in pg_proc...');
  const { data: funcCheck, error: funcError } = await supabase
    .from('pg_proc')
    .select('*')
    .ilike('proname', '%learning_path%')
    .limit(5);

  if (funcError) {
    console.log('Could not query pg_proc:', funcError.message);
  } else {
    console.log('Functions found:', funcCheck?.map(f => f.proname) || 'none');
  }
}

testRPCFunction().catch(console.error);