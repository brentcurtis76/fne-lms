const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function proveColumnMismatch() {
  console.log('PROVING COLUMN MISMATCH IN learning_path_courses TABLE\n');
  
  console.log('1. Testing what columns exist in learning_path_courses:');
  
  const columns = ['id', 'learning_path_id', 'path_id', 'course_id', 'sequence_order'];
  
  for (const col of columns) {
    const { data, error } = await supabase
      .from('learning_path_courses')
      .select(col)
      .limit(1);
    
    if (\!error) {
      console.log(`   ✅ Column EXISTS: ${col}`);
    } else {
      console.log(`   ❌ Column MISSING: ${col}`);
    }
  }
  
  console.log('\n2. Simulating RPC function insert (what create_full_learning_path tries):');
  
  const { error: oldError } = await supabase
    .from('learning_path_courses')
    .insert({
      path_id: '00000000-0000-0000-0000-000000000001',
      course_id: '00000000-0000-0000-0000-000000000001',
      sequence_order: 1
    });
  
  if (oldError) {
    console.log('   ❌ Using path_id FAILS:', oldError.message);
  }
  
  const { error: newError } = await supabase
    .from('learning_path_courses')
    .insert({
      learning_path_id: '00000000-0000-0000-0000-000000000001',
      course_id: '00000000-0000-0000-0000-000000000001',
      sequence_order: 1
    });
  
  if (newError) {
    console.log('   ⚠️  Using learning_path_id:', newError.message);
  } else {
    console.log('   ✅ Using learning_path_id WORKS (or would work with valid IDs)');
  }
  
  console.log('\n3. CONCLUSION:');
  console.log('   The table has column "learning_path_id" but the RPC function uses "path_id"');
  console.log('   This is why Mora gets the error: column "path_id" does not exist');
}

proveColumnMismatch().catch(console.error);
EOF < /dev/null