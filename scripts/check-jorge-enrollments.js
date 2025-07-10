import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JORGE_ID = '372ab00b-1d39-4574-8eff-d756b9d6b861';

async function checkJorgeEnrollments() {
  try {
    console.log('=== Checking Jorge Parra\'s Course Enrollments ===\n');
    console.log('Jorge ID:', JORGE_ID);
    console.log('Email: jorge@lospellines.cl');
    console.log('Role: admin at Los Pellines\n');

    // First check if user_courses table exists
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .ilike('table_name', '%course%');
    
    console.log('Course-related tables in database:');
    console.table(tables);
    
    // Check all course enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('user_courses')
      .select('*')
      .eq('user_id', JORGE_ID);

    if (enrollError) {
      console.error('Error fetching enrollments:', enrollError);
      return;
    }

    if (enrollments.length === 0) {
      console.log('Jorge is not enrolled in any courses.\n');
    } else {
      console.log('Current course enrollments:');
      console.table(enrollments.map(e => ({
        course_id: e.course_id,
        course_title: e.courses?.title || 'Unknown',
        enrolled_at: e.created_at,
        progress: e.progress || 0
      })));
    }

    // Find the Introducción a la Mentoría course
    console.log('\n=== Looking for "Introducción a la Mentoría" course ===\n');
    
    const { data: mentoriaCourse, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .ilike('title', '%introducción%mentoría%')
      .single();

    if (courseError && courseError.code !== 'PGRST116') {
      console.error('Error finding course:', courseError);
      return;
    }

    if (!mentoriaCourse) {
      console.log('Course "Introducción a la Mentoría" not found in the system!');
      
      // Let's search more broadly
      const { data: allCourses, error: allError } = await supabase
        .from('courses')
        .select('id, title')
        .ilike('title', '%mentor%');
      
      if (allCourses && allCourses.length > 0) {
        console.log('\nFound courses with "mentor" in title:');
        console.table(allCourses);
      }
    } else {
      console.log('Found course:');
      console.log('ID:', mentoriaCourse.id);
      console.log('Title:', mentoriaCourse.title);
      console.log('Description:', mentoriaCourse.description);
      
      // Check if Jorge is already enrolled
      const isEnrolled = enrollments.some(e => e.course_id === mentoriaCourse.id);
      
      if (isEnrolled) {
        console.log('\n✅ Jorge is already enrolled in this course!');
      } else {
        console.log('\n❌ Jorge is NOT enrolled in this course.');
        console.log('\nTo enroll Jorge, we need to create an entry in user_courses table.');
        console.log(`\nSQL to enroll:\nINSERT INTO user_courses (user_id, course_id) VALUES ('${JORGE_ID}', '${mentoriaCourse.id}');`);
      }
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

checkJorgeEnrollments();