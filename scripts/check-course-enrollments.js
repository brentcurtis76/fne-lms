const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEnrollments() {
  console.log('🔍 Checking course enrollment status...\n');

  // Check total enrollments
  const { count: totalEnrollments, error: countError } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error counting enrollments:', countError);
    return;
  }

  console.log(`📊 Total course enrollments: ${totalEnrollments}\n`);

  // Check enrollments for Liceo Nacional de Llolleo students
  const { data: llolleoStudents, error: llolleoError } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      first_name,
      last_name,
      user_roles!inner(school_id, schools!inner(name))
    `)
    .ilike('user_roles.schools.name', '%llolleo%');

  if (llolleoError) {
    console.error('❌ Error fetching Llolleo students:', llolleoError);
  } else {
    console.log(`👥 Students from Llolleo schools: ${llolleoStudents?.length || 0}`);

    if (llolleoStudents && llolleoStudents.length > 0) {
      // Check enrollments for first student
      const firstStudent = llolleoStudents[0];
      console.log(`\n🔍 Checking enrollments for: ${firstStudent.first_name} ${firstStudent.last_name} (${firstStudent.email})`);

      const { data: enrollments, error: enrollError } = await supabase
        .from('course_enrollments')
        .select('*, courses(title)')
        .eq('student_id', firstStudent.id);

      if (enrollError) {
        console.error('❌ Error fetching enrollments:', enrollError);
      } else {
        console.log(`📚 Enrollments for this student: ${enrollments?.length || 0}`);
        if (enrollments && enrollments.length > 0) {
          enrollments.forEach(e => {
            console.log(`   - ${e.courses.title}`);
          });
        }
      }
    }
  }

  // Check if there are students WITHOUT enrollments
  const { data: studentsWithoutEnrollments, error: noEnrollError } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      first_name,
      last_name,
      user_roles!inner(role_type)
    `)
    .eq('user_roles.role_type', 'estudiante')
    .eq('approval_status', 'approved');

  if (noEnrollError) {
    console.error('❌ Error fetching students:', noEnrollError);
  } else {
    console.log(`\n👥 Total approved students: ${studentsWithoutEnrollments?.length || 0}`);

    // Check how many have enrollments
    if (studentsWithoutEnrollments && studentsWithoutEnrollments.length > 0) {
      let withEnrollments = 0;
      let withoutEnrollments = 0;

      for (const student of studentsWithoutEnrollments.slice(0, 50)) {
        const { count } = await supabase
          .from('course_enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', student.id);

        if (count && count > 0) {
          withEnrollments++;
        } else {
          withoutEnrollments++;
        }
      }

      console.log(`   ✅ With enrollments: ${withEnrollments}`);
      console.log(`   ❌ Without enrollments: ${withoutEnrollments}`);
    }
  }

  // Check user_roles_cache status
  const { data: cacheData, error: cacheError } = await supabase
    .from('user_roles_cache')
    .select('*')
    .limit(5);

  if (cacheError) {
    console.error('\n❌ Error accessing user_roles_cache:', cacheError);
    console.log('⚠️  This could be the issue - the materialized view may not exist!');
  } else {
    console.log(`\n✅ user_roles_cache is accessible with ${cacheData?.length || 0} sample rows`);
  }
}

checkEnrollments().catch(console.error);
