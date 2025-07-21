const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkEnrollments() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found');
    process.exit(1);
  }

  console.log('🔍 Checking enrollment-related tables...\n');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const brentId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  try {
    // Check courses
    const { count: courseCount, error: courseError } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📚 Total Courses: ${courseCount || 0}`);
    
    // Check modules
    const { count: moduleCount, error: moduleError } = await supabase
      .from('modules')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📖 Total Modules: ${moduleCount || 0}`);
    
    // Check lessons
    const { count: lessonCount, error: lessonError } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📝 Total Lessons: ${lessonCount || 0}`);
    
    // Check enrollments table
    const { count: enrollmentCount, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true });
    
    console.log(`🎓 Total Enrollments: ${enrollmentCount || 0}`);
    
    // Check course_enrollments table
    const { count: courseEnrollmentCount, error: courseEnrollmentError } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📋 Total Course Enrollments: ${courseEnrollmentCount || 0}`);
    
    // Check if Brent has any enrollments
    console.log(`\n🔍 Checking Brent's enrollments...`);
    
    // Check in enrollments table
    const { data: brentEnrollments, error: brentEnrError } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', brentId);
    
    if (brentEnrollments && brentEnrollments.length > 0) {
      console.log(`✅ Found ${brentEnrollments.length} enrollments for Brent in enrollments table`);
    } else {
      console.log('❌ No enrollments found for Brent in enrollments table');
    }
    
    // Check in course_enrollments table
    const { data: brentCourseEnrollments, error: brentCourseEnrError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', brentId);
    
    if (brentCourseEnrollments && brentCourseEnrollments.length > 0) {
      console.log(`✅ Found ${brentCourseEnrollments.length} course enrollments for Brent`);
    } else {
      console.log('❌ No course enrollments found for Brent');
    }
    
    // Check assignments
    const { count: assignmentCount, error: assignmentError } = await supabase
      .from('assignments')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📄 Total Assignments: ${assignmentCount || 0}`);
    
    // Check user_assignments
    const { count: userAssignmentCount, error: userAssignmentError } = await supabase
      .from('user_assignments')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📌 Total User Assignments: ${userAssignmentCount || 0}`);
    
    // Check Brent's user_assignments
    const { data: brentAssignments, error: brentAssignError } = await supabase
      .from('user_assignments')
      .select('*')
      .eq('user_id', brentId);
    
    if (brentAssignments && brentAssignments.length > 0) {
      console.log(`✅ Found ${brentAssignments.length} assignments for Brent`);
    } else {
      console.log('❌ No assignments found for Brent');
    }
    
    // Sample some courses
    console.log('\n📚 Sample courses:');
    const { data: sampleCourses, error: sampleCoursesError } = await supabase
      .from('courses')
      .select('id, title, status, created_by')
      .limit(5);
    
    if (sampleCourses && sampleCourses.length > 0) {
      sampleCourses.forEach(course => {
        console.log(`  - ${course.title} (ID: ${course.id}, Status: ${course.status})`);
      });
    }
    
    // Check if there are any active courses
    const { count: activeCount } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    console.log(`\n✅ Active courses: ${activeCount || 0}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkEnrollments();