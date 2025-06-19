const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testGroupAssignments() {
  console.log('Testing Group Assignments V2...\n');

  // Test user ID - replace with actual user ID
  const testUserId = 'YOUR_USER_ID_HERE';

  try {
    // 1. Check if user_roles table exists and has data
    console.log('1. Checking user_roles table...');
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('id, community_id, role_type')
      .eq('id', testUserId)
      .single();

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      console.log('\nTrying to get any user from user_roles...');
      const { data: anyUser, error: anyError } = await supabase
        .from('user_roles')
        .select('id, community_id, role_type')
        .limit(1);
      
      if (anyError) {
        console.error('Cannot access user_roles table:', anyError);
      } else {
        console.log('Sample user:', anyUser);
      }
    } else {
      console.log('User role found:', userRole);
    }

    // 2. Check if course_community_assignments exists
    console.log('\n2. Checking course_community_assignments table...');
    const { data: assignments, error: assignError } = await supabase
      .from('course_community_assignments')
      .select('*')
      .limit(5);

    if (assignError) {
      console.error('Error accessing course_community_assignments:', assignError);
    } else {
      console.log(`Found ${assignments?.length || 0} course-community assignments`);
    }

    // 3. Check if lessons table exists
    console.log('\n3. Checking lessons table...');
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, title, content')
      .limit(5);

    if (lessonsError) {
      console.error('Error accessing lessons:', lessonsError);
    } else {
      console.log(`Found ${lessons?.length || 0} lessons`);
      
      // Check for group assignment blocks
      let groupAssignmentCount = 0;
      lessons?.forEach(lesson => {
        if (lesson.content?.blocks) {
          lesson.content.blocks.forEach(block => {
            if (block.type === 'group-assignment' || block.type === 'group_assignment') {
              groupAssignmentCount++;
              console.log(`Found group assignment in lesson "${lesson.title}"`);
            }
          });
        }
      });
      console.log(`Total group assignments found: ${groupAssignmentCount}`);
    }

    // 4. Check group assignment tables
    console.log('\n4. Checking group assignment tables...');
    
    // Check group_assignment_groups
    const { data: groups, error: groupsError } = await supabase
      .from('group_assignment_groups')
      .select('*')
      .limit(5);

    if (groupsError) {
      console.error('Error accessing group_assignment_groups:', groupsError);
    } else {
      console.log(`Found ${groups?.length || 0} groups`);
    }

    // Check group_assignment_members
    const { data: members, error: membersError } = await supabase
      .from('group_assignment_members')
      .select('*')
      .limit(5);

    if (membersError) {
      console.error('Error accessing group_assignment_members:', membersError);
    } else {
      console.log(`Found ${members?.length || 0} group members`);
    }

    // Check group_assignment_submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from('group_assignment_submissions')
      .select('*')
      .limit(5);

    if (submissionsError) {
      console.error('Error accessing group_assignment_submissions:', submissionsError);
    } else {
      console.log(`Found ${submissions?.length || 0} submissions`);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testGroupAssignments();