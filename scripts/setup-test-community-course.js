const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupTestCommunityAssignment() {
  console.log('Setting up test community course assignment...\n');

  try {
    // Get a test community
    const { data: community } = await supabase
      .from('growth_communities')
      .select('*')
      .limit(1)
      .single();

    if (!community) {
      console.error('No communities found');
      return;
    }

    console.log('Found community:', community.name);

    // Get the course we just created a lesson for
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

    // Get a consultant to assign
    const { data: consultant } = await supabase
      .from('user_roles')
      .select('*')
      .eq('role_type', 'consultor')
      .limit(1)
      .single();

    if (!consultant) {
      console.error('No consultant found');
      return;
    }

    console.log('Found consultant:', consultant.id);

    // Check if assignment already exists
    const { data: existingAssignment } = await supabase
      .from('consultant_assignments')
      .select('*')
      .eq('consultant_id', consultant.id)
      .eq('community_id', community.id)
      .eq('assigned_entity_id', course.id)
      .single();

    if (existingAssignment) {
      console.log('Assignment already exists');
      return;
    }

    // Create consultant assignment
    const { data: assignment, error: assignError } = await supabase
      .from('consultant_assignments')
      .insert({
        consultant_id: consultant.id,
        assignment_type: 'Completa',
        assigned_entity_type: 'course',
        assigned_entity_id: course.id,
        community_id: community.id,
        is_active: true,
        can_view_progress: true,
        can_assign_courses: true,
        can_message_student: true
      })
      .select()
      .single();

    if (assignError) {
      console.error('Error creating assignment:', assignError);
    } else {
      console.log('✅ Successfully created consultant assignment!');
      console.log('Assignment ID:', assignment.id);
      console.log('\nNow users in community', community.name, 'should see group assignments from course', course.title);
    }

  } catch (error) {
    console.error('Failed:', error);
  }
}

setupTestCommunityAssignment();