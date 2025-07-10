import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JORGE_ID = '372ab00b-1d39-4574-8eff-d756b9d6b861';

async function checkJorgeCourseStatus() {
  try {
    console.log('=== Jorge Parra Course Enrollment Status ===\n');
    console.log('User: Jorge Parra (jorge@lospellines.cl)');
    console.log('ID:', JORGE_ID);
    console.log('School: Los Pellines');
    console.log('Role: Admin\n');

    // Check current course assignments
    const { data: assignments, error } = await supabase
      .from('course_assignments')
      .select(`
        course_id,
        assigned_at,
        courses(
          id,
          title,
          description
        )
      `)
      .eq('teacher_id', JORGE_ID);

    if (error) {
      console.error('Error fetching assignments:', error);
      return;
    }

    if (!assignments || assignments.length === 0) {
      console.log('❌ Jorge is not enrolled in any courses.\n');
      
      console.log('=== Recommended Courses for Jorge ===\n');
      console.log('Since Jorge is new to Los Pellines, I recommend enrolling him in:');
      console.log('\n1. Introducción a Los Pellines (ID: 72191f5b-a66a-422f-8d6a-51b27543ded1)');
      console.log('   - This is the main introductory course for the school');
      console.log('\n2. Introducción al plan personal (ID: daecf11a-72eb-4d35-b4f3-5da2a5118a44)');
      console.log('   - This introduces the personalized learning methodology');
      
      console.log('\n\nNote: There is no course called "Introducción a la Mentoría" in the system.');
      console.log('The courses above are the most relevant introductory courses available.');
    } else {
      console.log(`✅ Jorge is enrolled in ${assignments.length} course(s):\n`);
      
      assignments.forEach((assignment, index) => {
        console.log(`${index + 1}. ${assignment.courses?.title || 'Unknown Course'}`);
        console.log(`   Course ID: ${assignment.course_id}`);
        console.log(`   Enrolled: ${new Date(assignment.assigned_at).toLocaleDateString()}`);
        console.log(`   Description: ${assignment.courses?.description?.substring(0, 80)}...`);
        console.log();
      });
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

checkJorgeCourseStatus();