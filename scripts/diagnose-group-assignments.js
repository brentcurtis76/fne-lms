#!/usr/bin/env node

/**
 * Diagnostic script for group assignments not showing up
 * This script helps identify why certain communities don't see group assignments
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseGroupAssignments(communityName = 'Nattaly Gutierrez') {
  console.log(`\n🔍 Diagnosing group assignments for community: ${communityName}\n`);

  try {
    // 1. Find the community
    const { data: communities, error: communityError } = await supabase
      .from('growth_communities')
      .select('id, name')
      .ilike('name', `%${communityName}%`);

    if (communityError) {
      console.error('❌ Error finding community:', communityError);
      return;
    }

    if (!communities || communities.length === 0) {
      console.log('❌ No community found with that name');
      return;
    }

    const community = communities[0];
    console.log(`✅ Found community: ${community.name} (ID: ${community.id})`);

    // 2. Find users in the community
    const { data: users, error: usersError } = await supabase
      .from('user_roles')
      .select('user_id, profiles!user_roles_user_id_fkey(email, first_name, last_name)')
      .eq('community_id', community.id)
      .eq('is_active', true);

    if (usersError) {
      console.error('❌ Error finding users:', usersError);
      return;
    }

    console.log(`\n👥 Found ${users?.length || 0} users in the community`);

    // 3. Find consultant assignments for the community
    const { data: consultants, error: consultantError } = await supabase
      .from('consultant_assignments')
      .select(`
        consultant_id, 
        can_assign_courses,
        profiles!consultant_assignments_consultant_id_fkey(email, first_name)
      `)
      .eq('community_id', community.id)
      .eq('is_active', true);

    if (consultantError) {
      console.error('❌ Error finding consultants:', consultantError);
      return;
    }

    console.log(`\n👨‍🏫 Found ${consultants?.length || 0} consultants assigned to this community`);
    consultants?.forEach(c => {
      console.log(`   - ${c.profiles?.email} (Can assign courses: ${c.can_assign_courses})`);
    });

    // 4. Check course assignments for consultants
    let courseAssignments = [];
    let groupAssignmentCount = 0;
    
    if (consultants && consultants.length > 0) {
      const consultantIds = consultants.map(c => c.consultant_id);
      
      const { data: courses, error: courseError } = await supabase
        .from('course_assignments')
        .select('course_id, courses!inner(title)')
        .in('teacher_id', consultantIds);

      if (courseError) {
        console.error('❌ Error finding course assignments:', courseError);
      } else {
        courseAssignments = courses || [];
      }

      console.log(`\n📚 Found ${courseAssignments.length} courses assigned to consultants`);
      courseAssignments.forEach(ca => {
        console.log(`   - ${ca.courses.title}`);
      });

      // 5. Check if these courses have group assignments
      if (courseAssignments.length > 0) {
        const courseIds = courseAssignments.map(ca => ca.course_id);
        
        const { data: lessons, error: lessonsError } = await supabase
          .from('lessons')
          .select('id, title, course_id, content')
          .in('course_id', courseIds);

        if (lessonsError) {
          console.error('❌ Error finding lessons:', lessonsError);
        } else if (lessons) {
          lessons.forEach(lesson => {
            if (lesson.content?.blocks) {
              lesson.content.blocks.forEach(block => {
                if (block.type === 'group-assignment' || block.type === 'group_assignment') {
                  groupAssignmentCount++;
                }
              });
            }
          });
        }

        console.log(`\n📝 Found ${groupAssignmentCount} group assignment blocks in these courses`);
      }
    }

    // 6. Check direct course enrollments for users
    if (users && users.length > 0) {
      const userIds = users.map(u => u.user_id);
      
      const { data: enrollments, error: enrollmentError } = await supabase
        .from('course_enrollments')
        .select('user_id, course_id, courses!inner(title)')
        .in('user_id', userIds)
        .eq('status', 'active');

      if (enrollmentError) {
        console.error('❌ Error finding enrollments:', enrollmentError);
        return;
      }

      console.log(`\n🎓 Found ${enrollments?.length || 0} direct course enrollments for community users`);
      if (enrollments && enrollments.length > 0) {
        const enrolledCourses = [...new Set(enrollments.map(e => e.courses.title))];
        enrolledCourses.forEach(title => {
          console.log(`   - ${title}`);
        });
      }
    }

    // 7. Diagnosis summary
    console.log('\n📋 DIAGNOSIS SUMMARY:');
    console.log('====================');
    
    if (!consultants || consultants.length === 0) {
      console.log('⚠️  No consultants assigned to this community');
      console.log('   → Students won\'t see group assignments');
      console.log('   → SOLUTION: Assign a consultant to this community');
    } else if (courseAssignments.length === 0) {
      console.log('⚠️  Consultants have no courses assigned');
      console.log('   → Students won\'t see group assignments');
      console.log('   → SOLUTION: Assign courses to the consultant(s)');
    } else if (groupAssignmentCount === 0) {
      console.log('⚠️  Assigned courses have no group assignment blocks');
      console.log('   → Students won\'t see any group assignments');
      console.log('   → SOLUTION: Add group assignment blocks to course lessons');
    } else {
      console.log('✅ Setup looks correct. Group assignments should be visible.');
      console.log('   → If still not showing, check the UI code or user permissions');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the diagnosis
const communityName = process.argv[2] || 'Nattaly Gutierrez';
diagnoseGroupAssignments(communityName);