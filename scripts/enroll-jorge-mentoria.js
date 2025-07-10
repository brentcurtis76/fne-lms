import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JORGE_ID = '372ab00b-1d39-4574-8eff-d756b9d6b861';
const ADMIN_ID = '08b12c25-f234-4cec-a2d2-3c7f5b2b5baa'; // Default admin to use as assigned_by

async function enrollJorgeInMentoria() {
  try {
    console.log('=== Enrolling Jorge Parra in Introducción a la Mentoría ===\n');
    console.log('Jorge ID:', JORGE_ID);
    console.log('Email: jorge@lospellines.cl\n');

    // Find the Introducción a la Mentoría course
    console.log('Searching for "Introducción a la Mentoría" course...\n');
    
    const { data: courses, error: searchError } = await supabase
      .from('courses')
      .select('id, title, description')
      .ilike('title', '%introducción%mentor%');

    if (searchError) {
      console.error('Error searching for course:', searchError);
      return;
    }

    if (!courses || courses.length === 0) {
      console.log('❌ Course "Introducción a la Mentoría" not found!');
      
      // Let's search more broadly
      const { data: allMentorCourses } = await supabase
        .from('courses')
        .select('id, title')
        .or('title.ilike.%mentor%,description.ilike.%mentor%');
      
      if (allMentorCourses && allMentorCourses.length > 0) {
        console.log('\nCourses containing "mentor":');
        console.table(allMentorCourses);
      }
      return;
    }

    const mentoriaCourse = courses[0];
    console.log('✅ Found course:');
    console.log('ID:', mentoriaCourse.id);
    console.log('Title:', mentoriaCourse.title);
    console.log('Description:', mentoriaCourse.description?.substring(0, 100) + '...\n');

    // Check if Jorge is already enrolled
    const { data: existingAssignment, error: checkError } = await supabase
      .from('course_assignments')
      .select('*')
      .eq('course_id', mentoriaCourse.id)
      .eq('teacher_id', JORGE_ID)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing enrollment:', checkError);
      return;
    }

    if (existingAssignment) {
      console.log('✅ Jorge is already enrolled in this course!');
      console.log('Enrolled on:', existingAssignment.assigned_at);
      return;
    }

    // Enroll Jorge in the course
    console.log('Enrolling Jorge in the course...');
    
    const { data: newAssignment, error: enrollError } = await supabase
      .from('course_assignments')
      .insert({
        course_id: mentoriaCourse.id,
        teacher_id: JORGE_ID,
        assigned_by: ADMIN_ID
      })
      .select()
      .single();

    if (enrollError) {
      console.error('❌ Error enrolling Jorge:', enrollError);
      return;
    }

    console.log('\n✅ SUCCESS! Jorge has been enrolled in "Introducción a la Mentoría"');
    console.log('Assignment details:', newAssignment);
    console.log('\nJorge can now access the course at:');
    console.log(`https://fne-lms.vercel.app/courses/${mentoriaCourse.id}`);

  } catch (error) {
    console.error('Script error:', error);
  }
}

enrollJorgeInMentoria();