import * as dotenv from 'dotenv';
dotenv.config(); // Load .env.local variables

console.log('✅ Running insert-course-missing-fields.ts');

import { createClient } from '@supabase/supabase-js';

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, anonKey);

// Test data (missing the required 'instructor_id')
const testCourse = {
  title: '🚨 Should fail - missing instructor_id',
  description: 'This test should fail because instructor_id is missing',
  thumbnail_url: 'https://example.com/default-thumbnail.png',
  created_by: '6a4962f0-0d7b-45ce-838f-ead89c77b09d'
};

async function runTest() {
  console.log('🧪 Testing insert with data (missing instructor_id):');
  console.log(testCourse);

  const { data, error } = await supabase
    .from('courses')
    .insert([testCourse])
    .select()
    .single();

  if (error) {
    console.log('✅ Insert failed as expected (missing instructor_id). Test passed.');
    console.error('❌ Insert failed as expected:', error.message);
    process.exit(0); // ✅ Test passed because insert failed as expected
  } else {
    console.error('🚨 Test failed: insert should NOT have succeeded');
    console.log('Unexpected insert result:', data);
    process.exit(1);
  }
}

runTest();
