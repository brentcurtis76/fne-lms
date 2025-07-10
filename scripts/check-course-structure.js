import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JORGE_ID = '372ab00b-1d39-4574-8eff-d756b9d6b861';

async function checkCourseStructure() {
  try {
    console.log('=== Checking Course Structure ===\n');

    // Check if courses table exists
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, title')
      .limit(5);

    if (courseError) {
      console.error('Error checking courses table:', courseError);
    } else {
      console.log('Sample courses:');
      console.table(courses);
    }

    // Check if user_courses table exists
    const { data: userCourses, error: ucError } = await supabase
      .from('user_courses')
      .select('*')
      .eq('user_id', JORGE_ID);

    if (ucError) {
      console.error('\nError checking user_courses table:', ucError);
      console.log('\nThis might mean the table doesn\'t exist or has a different name.');
    } else {
      console.log('\nJorge\'s course enrollments:');
      console.table(userCourses);
    }

    // Look for the mentoring course
    console.log('\n=== Searching for Mentoring Course ===\n');
    
    const { data: mentoringCourses, error: searchError } = await supabase
      .from('courses')
      .select('id, title, description')
      .or('title.ilike.%mentor%,title.ilike.%introducción%');

    if (searchError) {
      console.error('Error searching courses:', searchError);
    } else if (mentoringCourses.length === 0) {
      console.log('No courses found with "mentor" or "introducción" in the title.');
    } else {
      console.log('Found courses:');
      mentoringCourses.forEach(course => {
        console.log(`\nID: ${course.id}`);
        console.log(`Title: ${course.title}`);
        console.log(`Description: ${course.description?.substring(0, 100)}...`);
      });

      // Check Jorge's enrollment in each
      if (!ucError && userCourses) {
        mentoringCourses.forEach(course => {
          const enrolled = userCourses.some(uc => uc.course_id === course.id);
          console.log(`\nEnrolled in "${course.title}": ${enrolled ? '✅ Yes' : '❌ No'}`);
        });
      }
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

checkCourseStructure();