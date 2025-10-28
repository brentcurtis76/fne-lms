const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLlolleo() {
  console.log('🔍 LLOLLEO STUDENT VERIFICATION\n');

  const { data: school } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%llolleo%')
    .single();

  console.log(`School: ${school.name} (ID: ${school.id})\n`);

  const { data: cache } = await supabase
    .from('user_roles_cache')
    .select('user_id, role, school_id')
    .eq('school_id', school.id);

  console.log(`✅ ${cache.length} Llolleo users in cache\n`);

  const roleCount = {};
  cache.forEach(u => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });
  Object.entries(roleCount).forEach(([role, count]) => {
    console.log(`   ${role}: ${count}`);
  });

  const userIds = cache.map(u => u.user_id);
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('student_id, course_id, courses(title)')
    .in('student_id', userIds);

  console.log(`\n📖 ${enrollments.length} course enrollments for Llolleo\n`);

  if (enrollments.length > 0) {
    const test = enrollments[0];
    console.log(`🧪 Testing: ${test.courses.title}`);

    const { error } = await supabase
      .from('courses')
      .select('id')
      .eq('id', test.course_id)
      .single();

    if (error) {
      console.log('❌ FAILED:', error.message);
      console.log('\n🚨 FIX NOT WORKING FOR LLOLLEO!');
    } else {
      console.log('✅ SUCCESS!\n');
      console.log('═'.repeat(60));
      console.log('🎉 THE FIX WORKS FOR LLOLLEO STUDENTS!');
      console.log('═'.repeat(60));
    }
  }
}

checkLlolleo().catch(console.error);
