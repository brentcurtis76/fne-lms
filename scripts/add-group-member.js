#!/usr/bin/env node

/**
 * Add Group Member Script
 *
 * This script adds a user to a group assignment and verifies the setup.
 * It ensures the user is enrolled in the course and assigned to the same group.
 *
 * Usage:
 *   node scripts/add-group-member.js <user-email> <assignment-id>
 *
 * Example:
 *   node scripts/add-group-member.js test@example.com block-123
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Main script function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Usage: node scripts/add-group-member.js <user-email> <assignment-id>');
    console.error('');
    console.error('Example:');
    console.error('  node scripts/add-group-member.js test@example.com block-123');
    process.exit(1);
  }

  const [userEmail, assignmentId] = args;

  console.log('🚀 Starting group member addition process...');
  console.log('📧 User email:', userEmail);
  console.log('📝 Assignment ID:', assignmentId);
  console.log('');

  try {
    // Step 1: Get user by email
    console.log('Step 1: Looking up user...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', userEmail)
      .single();

    if (profileError || !profile) {
      console.error('❌ User not found:', userEmail);
      console.error('   Error:', profileError?.message || 'No profile returned');
      process.exit(1);
    }

    console.log('✅ User found:', {
      id: profile.id,
      name: `${profile.first_name} ${profile.last_name}`,
      email: profile.email
    });
    console.log('');

    // Step 2: Get assignment details
    console.log('Step 2: Fetching assignment details...');
    const { data: block, error: blockError } = await supabase
      .from('blocks')
      .select('id, lesson_id, payload')
      .eq('id', assignmentId)
      .eq('type', 'group-assignment')
      .single();

    if (blockError || !block) {
      console.error('❌ Assignment not found:', assignmentId);
      console.error('   Error:', blockError?.message || 'No block returned');
      process.exit(1);
    }

    console.log('✅ Assignment found:', {
      id: block.id,
      lesson_id: block.lesson_id,
      title: block.payload?.title || 'Untitled'
    });
    console.log('');

    // Step 3: Get course from lesson
    console.log('Step 3: Finding course...');
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, course_id, title')
      .eq('id', block.lesson_id)
      .single();

    if (lessonError || !lesson) {
      console.error('❌ Lesson not found:', block.lesson_id);
      console.error('   Error:', lessonError?.message || 'No lesson returned');
      process.exit(1);
    }

    console.log('✅ Lesson found:', {
      id: lesson.id,
      course_id: lesson.course_id,
      title: lesson.title
    });
    console.log('');

    // Step 4: Get user's community
    console.log('Step 4: Finding user community...');
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('community_id, role_type')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .limit(1);

    if (rolesError || !userRoles || userRoles.length === 0) {
      console.error('❌ No active user role found for user');
      console.error('   Error:', rolesError?.message || 'No roles returned');
      process.exit(1);
    }

    const communityId = userRoles[0].community_id;
    console.log('✅ User community:', {
      community_id: communityId,
      role_type: userRoles[0].role_type
    });
    console.log('');

    // Step 5: Check if user is enrolled in course
    console.log('Step 5: Checking course enrollment...');
    const { data: existingEnrollment } = await supabase
      .from('course_enrollments')
      .select('id, status')
      .eq('user_id', profile.id)
      .eq('course_id', lesson.course_id)
      .single();

    if (existingEnrollment) {
      console.log('✅ User already enrolled in course:', {
        enrollment_id: existingEnrollment.id,
        status: existingEnrollment.status
      });
    } else {
      console.log('📝 Creating course enrollment...');
      const { data: newEnrollment, error: enrollmentError } = await supabase
        .from('course_enrollments')
        .insert({
          user_id: profile.id,
          course_id: lesson.course_id,
          status: 'active',
          enrolled_at: new Date().toISOString()
        })
        .select()
        .single();

      if (enrollmentError) {
        console.error('❌ Failed to create enrollment:', enrollmentError.message);
        process.exit(1);
      }

      console.log('✅ Course enrollment created:', newEnrollment.id);
    }
    console.log('');

    // Step 6: Find or create group
    console.log('Step 6: Finding or creating group...');

    // First, try to find an existing group for this assignment
    const { data: existingGroups } = await supabase
      .from('group_assignment_groups')
      .select('*')
      .eq('assignment_id', assignmentId)
      .eq('community_id', communityId)
      .limit(1);

    let groupId;

    if (existingGroups && existingGroups.length > 0) {
      groupId = existingGroups[0].id;
      console.log('✅ Found existing group:', {
        group_id: groupId,
        name: existingGroups[0].name
      });
    } else {
      console.log('📝 Creating new group...');
      const { data: newGroup, error: groupError } = await supabase
        .from('group_assignment_groups')
        .insert({
          assignment_id: assignmentId,
          community_id: communityId,
          name: `Grupo ${Math.floor(Math.random() * 1000)}`
        })
        .select()
        .single();

      if (groupError) {
        console.error('❌ Failed to create group:', groupError.message);
        process.exit(1);
      }

      groupId = newGroup.id;
      console.log('✅ Group created:', {
        group_id: groupId,
        name: newGroup.name
      });
    }
    console.log('');

    // Step 7: Check if user is already a member
    console.log('Step 7: Checking group membership...');
    const { data: existingMembership } = await supabase
      .from('group_assignment_members')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('user_id', profile.id)
      .single();

    if (existingMembership) {
      console.log('✅ User already a group member:', existingMembership.id);
    } else {
      console.log('📝 Adding user to group...');
      const { data: newMember, error: memberError } = await supabase
        .from('group_assignment_members')
        .insert({
          assignment_id: assignmentId,
          group_id: groupId,
          user_id: profile.id,
          joined_at: new Date().toISOString()
        })
        .select()
        .single();

      if (memberError) {
        console.error('❌ Failed to add member:', memberError.message);
        process.exit(1);
      }

      console.log('✅ User added to group:', newMember.id);
    }
    console.log('');

    // Step 8: List all group members
    console.log('Step 8: Fetching all group members...');
    const { data: allMembers, error: membersError } = await supabase
      .from('group_assignment_members')
      .select(`
        id,
        user_id,
        joined_at,
        user:profiles!group_assignment_members_user_id_fkey(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('assignment_id', assignmentId);

    if (membersError) {
      console.error('❌ Failed to fetch members:', membersError.message);
      process.exit(1);
    }

    console.log('✅ Group members (' + (allMembers?.length || 0) + '):');
    console.log('');

    if (allMembers && allMembers.length > 0) {
      allMembers.forEach((member, index) => {
        console.log(`   ${index + 1}. ${member.user?.first_name} ${member.user?.last_name}`);
        console.log(`      Email: ${member.user?.email}`);
        console.log(`      User ID: ${member.user_id}`);
        console.log(`      Joined: ${new Date(member.joined_at).toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('   (No members found)');
      console.log('');
    }

    // Step 9: Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ SUCCESS - Group member addition complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Summary:');
    console.log(`  User: ${profile.first_name} ${profile.last_name} (${profile.email})`);
    console.log(`  Assignment ID: ${assignmentId}`);
    console.log(`  Group ID: ${groupId}`);
    console.log(`  Total members: ${allMembers?.length || 0}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Navigate to Espacio Colaborativo → Tareas in the UI');
    console.log('  2. Open the assignment to verify members are visible');
    console.log('  3. Check browser console for any 406 errors');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ SCRIPT FAILED');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
main();
