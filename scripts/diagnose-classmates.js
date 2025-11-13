/**
 * Diagnostic script to investigate why eligible classmates aren't showing up
 *
 * Usage: node scripts/diagnose-classmates.js <assignmentId> <userId>
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseClassmates(assignmentId, userId) {
  console.log('\n📊 Diagnosing Classmates Issue');
  console.log('═══════════════════════════════════════\n');
  console.log('Assignment ID:', assignmentId);
  console.log('User ID:', userId);
  console.log('');

  try {
    // 1. Check if user has a group membership
    console.log('1️⃣  Checking user group membership...');
    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('*, group:group_assignment_groups(*)')
      .eq('assignment_id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      console.error('   ❌ Error fetching membership:', membershipError);
      return;
    }

    if (!membership) {
      console.log('   ❌ User is NOT a member of any group for this assignment');
      console.log('   💡 User must create/join a group first');
      return;
    }

    console.log('   ✅ User is member of group:', membership.group_id);
    console.log('   📋 Group details:', {
      name: membership.group.name,
      is_consultant_managed: membership.group.is_consultant_managed,
      max_members: membership.group.max_members
    });
    console.log('');

    const groupId = membership.group_id;

    // 1b. Get user's school_id (handle multiple roles)
    console.log('1️⃣b Checking user school assignment...');
    const { data: userRoles, error: userRoleError } = await supabase
      .from('user_roles')
      .select('school_id, role_type, community_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (userRoleError || !userRoles || userRoles.length === 0) {
      console.error('   ❌ User has no active roles:', userRoleError);
      return;
    }

    console.log(`   ✅ User has ${userRoles.length} active role(s):`);
    userRoles.forEach((role, index) => {
      console.log(`      ${index + 1}. ${role.role_type} - school_id: ${role.school_id || 'null'}, community_id: ${role.community_id || 'null'}`);
    });

    // Select school_id deterministically: prefer docente > estudiante > first with school_id
    let selectedRole = userRoles.find(r => r.role_type === 'docente' && r.school_id);
    if (!selectedRole) {
      selectedRole = userRoles.find(r => r.role_type === 'estudiante' && r.school_id);
    }
    if (!selectedRole) {
      selectedRole = userRoles.find(r => r.school_id);
    }

    if (!selectedRole || !selectedRole.school_id) {
      console.error('   ❌ No role with school_id found');
      return;
    }

    const userSchoolId = selectedRole.school_id;
    console.log(`   🎯 Selected role: ${selectedRole.role_type} with school_id: ${userSchoolId}`);
    console.log('');

    // 1c. Get assignment's course_id
    console.log('1️⃣c Checking assignment course...');
    const { data: assignmentBlock, error: blockError } = await supabase
      .from('blocks')
      .select('lesson_id')
      .eq('id', assignmentId)
      .maybeSingle();

    if (blockError || !assignmentBlock || !assignmentBlock.lesson_id) {
      console.error('   ❌ Assignment block not found:', blockError);
      return;
    }

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('course_id')
      .eq('id', assignmentBlock.lesson_id)
      .maybeSingle();

    if (lessonError || !lesson || !lesson.course_id) {
      console.error('   ❌ Lesson not found:', lessonError);
      return;
    }

    const courseId = lesson.course_id;
    console.log('   ✅ Assignment course_id:', courseId);
    console.log('');

    // 2. Check school members
    console.log('2️⃣  Checking school members...');
    const { data: schoolMembers, error: schoolError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        role_type,
        user:profiles(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('school_id', userSchoolId)
      .eq('is_active', true);

    if (schoolError) {
      console.error('   ❌ Error fetching school members:', schoolError);
      return;
    }

    console.log(`   ✅ Found ${schoolMembers?.length || 0} school members`);
    const excludingSelf = schoolMembers?.filter(m => m.user_id !== userId) || [];
    console.log(`   📊 Excluding self: ${excludingSelf.length} potential classmates`);
    console.log('');

    // 2b. Check course enrollments
    console.log('2️⃣b Checking course enrollments...');
    const { data: courseEnrollments, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .select(`
        user_id,
        status,
        user:profiles(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('course_id', courseId)
      .eq('status', 'active');

    if (enrollmentError) {
      console.error('   ❌ Error fetching enrollments:', enrollmentError);
      return;
    }

    console.log(`   ✅ Found ${courseEnrollments?.length || 0} active enrollments in course`);
    const enrolledUserIds = new Set(courseEnrollments?.map(e => e.user_id) || []);

    // Filter to classmates who are both in same school AND enrolled in course
    const enrolledClassmates = excludingSelf.filter(m => enrolledUserIds.has(m.user_id));
    console.log(`   📊 Same school + enrolled in course: ${enrolledClassmates.length}`);
    console.log('');

    // 3. Check who's already in groups
    console.log('3️⃣  Checking group assignments...');
    const { data: allGroupMembers, error: groupMembersError } = await supabase
      .from('group_assignment_members')
      .select('user_id, group_id, assignment_id')
      .eq('assignment_id', assignmentId);

    if (groupMembersError) {
      console.error('   ❌ Error fetching group members:', groupMembersError);
      return;
    }

    console.log(`   ✅ Found ${allGroupMembers?.length || 0} total group members for this assignment`);

    // Group members by user
    const userGroupMap = {};
    allGroupMembers?.forEach(m => {
      userGroupMap[m.user_id] = m.group_id;
    });

    console.log('   📋 User -> Group mapping:');
    Object.entries(userGroupMap).forEach(([uid, gid]) => {
      const member = schoolMembers?.find(cm => cm.user_id === uid);
      const name = member?.user ? `${member.user.first_name} ${member.user.last_name}` : 'Unknown';
      const isSameGroup = gid === groupId;
      console.log(`      ${uid.slice(0, 8)}... (${name}): group ${gid.slice(0, 8)}... ${isSameGroup ? '(SAME GROUP)' : '(DIFFERENT GROUP)'}`);
    });
    console.log('');

    // 4. Calculate eligible classmates
    console.log('4️⃣  Calculating eligible classmates...');
    const assignedUserIds = Object.keys(userGroupMap);
    const eligible = enrolledClassmates.filter(member => !assignedUserIds.includes(member.user_id));

    console.log(`   ✅ Eligible classmates: ${eligible.length}`);
    if (eligible.length > 0) {
      console.log('   📋 Eligible list:');
      eligible.forEach(m => {
        const name = m.user ? `${m.user.first_name} ${m.user.last_name}` : 'Unknown';
        console.log(`      - ${name} (${m.user?.email}) [${m.user_id.slice(0, 8)}...]`);
      });
    } else {
      console.log('   ⚠️  No eligible classmates found!');
      console.log('');
      console.log('   🔍 Reasons why this might happen:');
      console.log('      1. All school members enrolled in this course are already in groups');
      console.log('      2. No other school members are enrolled in this course');
      console.log('      3. Only one person in the school (you)');
    }
    console.log('');

    // 5. Summary
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log('School ID:', userSchoolId);
    console.log('Course ID:', courseId);
    console.log('Group ID:', groupId);
    console.log('Total school members:', schoolMembers?.length || 0);
    console.log('Excluding self:', excludingSelf.length);
    console.log('Enrolled in course:', enrolledClassmates.length);
    console.log('Already assigned:', assignedUserIds.length);
    console.log('Eligible classmates:', eligible.length);
    console.log('');

    if (eligible.length === 0 && enrolledClassmates.length > 0) {
      console.log('⚠️  ISSUE IDENTIFIED: All potential classmates are already in groups');
      console.log('💡 This is expected behavior - students already in groups cannot be invited');
    } else if (enrolledClassmates.length === 0 && excludingSelf.length > 0) {
      console.log('⚠️  ISSUE IDENTIFIED: No classmates from your school are enrolled in this course');
      console.log('💡 Enroll more students from school_id', userSchoolId, 'in course_id', courseId);
    } else if (excludingSelf.length === 0) {
      console.log('⚠️  ISSUE IDENTIFIED: No other members in school');
      console.log('💡 Add more users to school_id:', userSchoolId);
    } else if (eligible.length > 0) {
      console.log('✅ Everything looks good - classmates should appear in modal');
      console.log('🔍 Check browser console logs when opening modal');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Parse command line arguments
const assignmentId = process.argv[2];
const userId = process.argv[3];

if (!assignmentId || !userId) {
  console.error('Usage: node scripts/diagnose-classmates.js <assignmentId> <userId>');
  console.error('Example: node scripts/diagnose-classmates.js "abc123" "user-uuid-456"');
  process.exit(1);
}

diagnoseClassmates(assignmentId, userId)
  .then(() => {
    console.log('\n✅ Diagnosis complete\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Diagnosis failed:', error);
    process.exit(1);
  });
