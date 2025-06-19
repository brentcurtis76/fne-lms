const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupUserCourseAssignment() {
  console.log('Setting up test user course assignment...\n');

  try {
    // Get the currently logged in user (you'll need to get this from your current session)
    // For testing, let's get a docente user
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'docente')
      .limit(1)
      .single();

    if (!profile) {
      console.error('No docente user found');
      return;
    }

    console.log('Found docente:', profile.id, profile.email);

    // Get the course with group assignment
    const { data: course } = await supabase
      .from('courses')
      .select('*')
      .eq('title', 'Fundamentos de Los Pellines')
      .single();

    if (!course) {
      console.error('Course not found');
      return;
    }

    console.log('Found course:', course.title);

    // Check if assignment already exists
    const { data: existingAssignment } = await supabase
      .from('course_assignments')
      .select('*')
      .eq('teacher_id', profile.id)
      .eq('course_id', course.id)
      .single();

    if (existingAssignment) {
      console.log('Assignment already exists');
      return;
    }

    // Create course assignment
    const { data: assignment, error: assignError } = await supabase
      .from('course_assignments')
      .insert({
        teacher_id: profile.id,
        course_id: course.id,
        assignment_type: 'individual',
        status: 'active',
        assigned_by: profile.id
      })
      .select()
      .single();

    if (assignError) {
      console.error('Error creating assignment:', assignError);
    } else {
      console.log('✅ Successfully created course assignment!');
      console.log('Assignment ID:', assignment.id);
      console.log('\nNow the docente user should see group assignments from this course');
    }

  } catch (error) {
    console.error('Failed:', error);
  }
}

setupUserCourseAssignment();