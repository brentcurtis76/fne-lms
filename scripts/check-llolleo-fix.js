const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLlolleo() {
  console.log('🔍 CHECKING LLOLLEO STUDENTS IN CACHE\n');

  // Find Llolleo school
  const { data: school } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%llolleo%')
    .single();

  console.log(`School: ${school.name} (ID: ${school.id})\n`);

  // Check cache for Llolleo users (any role)
  const { data: llolleoCache, error: cacheError } = await supabase
    .from('user_roles_cache')
    .select('user_id, role, school_id')
    .eq('school_id', school.id);

  if (cacheError) {
    console.log('❌ ERROR:', cacheError.message);
    return;
  }

  console.log(`✅ ${llolleoCache.length} Llolleo users in cache:`);
  
  // Count by role
  const roleCount = {};
  llolleoCache.forEach(u => {
    roleCount[u.role] = (roleCount[u.role] || 0) + 1;
  });

  Object.entries(roleCount).forEach(([role, count]) => {
    console.log(`   ${role}: ${count}`);
  });

  // Find students specifically (check what the actual role value is)
  const students = llolleoCache.filter(u => 
    u.role.includes('student') || u.role.includes('alumno') || u.role === 'estudiante'
  );

  console.log(`\n📚 Students from Llolleo in cache: ${students.length}`);

  if (students.length === 0) {
    console.log('\n⚠️  NO STUDENTS from Llolleo in cache!');
    console.log('   Checking user_roles table directly...\n');

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, role_type, is_active')
      .eq('school_id', school.id)
      .eq('is_active', true)
      .limit(10);

    console.log('Sample user_roles for Llolleo:');
    userRoles.forEach(ur => {
      console.log(`   Role: ${ur.role_type}, Active: ${ur.is_active}`);
    });
  }

  // Check course enrollments for Llolleo (using all cached users)
  const llolleoUserIds = llolleoCache.map(u => u.user_id);

  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('student_id, course_id, courses(title)')
    .in('student_id', llolleoUserIds);

  console.log(`\n📖 Course enrollments for Llolleo users: ${enrollments?.length || 0}`);

  if (enrollments && enrollments.length > 0) {
    console.log('\nSample enrollments:');
    enrollments.slice(0, 3).forEach(e => {
      console.log(`   - ${e.courses.title}`);
    });

    // Test loading one course
    const testCourse = enrollments[0];
    console.log(`\n🧪 Testing course load: ${testCourse.courses.title}`);

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title')
      .eq('id', testCourse.course_id)
      .single();

    if (courseError) {
      console.log('❌ FAILED:', courseError.message);
      console.log('🚨 THE FIX IS NOT WORKING FOR LLOLLEO!');
    } else {
      console.log('✅ Course loads successfully!');
      console.log('\n🎉 THE FIX WORKS FOR LLOLLEO STUDENTS!');
    }
  } else {
    console.log('\n⚠️  No course enrollments found for Llolleo users');
  }
}

checkLlolleo().catch(console.error);
