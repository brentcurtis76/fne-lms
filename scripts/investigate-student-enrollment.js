const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateStudentEnrollment() {
  console.log('🎓 Student Enrollment and Lesson Progress Deep Dive');
  console.log('===================================================');
  
  try {
    // 1. Understand the course_assignments table better
    console.log('\n1. 📋 Course Assignments Analysis:');
    const { data: allAssignments, error: assignError } = await supabase
      .from('course_assignments')
      .select('*')
      .limit(5);
    
    if (assignError) {
      console.error('❌ Assignments error:', assignError);
    } else {
      console.log('✅ All course assignments:', allAssignments?.length || 0);
      if (allAssignments && allAssignments.length > 0) {
        console.log('Full assignment structure:', allAssignments[0]);
        console.log('All assignment columns:', Object.keys(allAssignments[0]));
      }
    }
    
    // 2. Check if there's a distinction between teachers and students
    console.log('\n2. 👨‍🎓 Teacher vs Student Analysis:');
    
    // Get user roles for assigned users
    const teacherIds = allAssignments?.map(a => a.teacher_id) || [];
    if (teacherIds.length > 0) {
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, role_type')
        .in('user_id', teacherIds.slice(0, 10))
        .eq('is_active', true);
      
      console.log('Roles of "teacher_id" users in course_assignments:');
      const roleCount = {};
      userRoles?.forEach(role => {
        roleCount[role.role_type] = (roleCount[role.role_type] || 0) + 1;
      });
      console.log(roleCount);
    }
    
    // 3. Check the lesson progress table more deeply
    console.log('\n3. 📚 Lesson Progress Deep Analysis:');
    const { data: lessonProgressAll, error: progressError } = await supabase
      .from('lesson_progress')
      .select('*')
      .limit(10);
    
    if (progressError) {
      console.error('❌ Lesson progress error:', progressError);
    } else {
      console.log('✅ Total lesson progress records:', lessonProgressAll?.length || 0);
      
      if (lessonProgressAll && lessonProgressAll.length > 0) {
        // Get unique users with lesson progress
        const uniqueUsers = [...new Set(lessonProgressAll.map(lp => lp.user_id))];
        console.log('Unique users with lesson progress:', uniqueUsers.length);
        
        // Get user info for those with lesson progress
        const { data: progressUsers } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', uniqueUsers.slice(0, 5));
        
        console.log('Users who have lesson progress:');
        progressUsers?.forEach(user => {
          const userProgress = lessonProgressAll.filter(lp => lp.user_id === user.id);
          console.log(`  ${user.first_name} ${user.last_name}: ${userProgress.length} lessons completed`);
        });
      }
    }
    
    // 4. Check the actual course structure
    console.log('\n4. 🎯 Course Structure Investigation:');
    const { data: coursesWithDetails } = await supabase
      .from('courses')
      .select(`
        id, 
        title,
        status,
        lessons:lessons(id, title, order_number, course_id)
      `)
      .limit(3);
    
    console.log('Courses with lessons:', coursesWithDetails?.length || 0);
    if (coursesWithDetails && coursesWithDetails.length > 0) {
      coursesWithDetails.forEach(course => {
        console.log(`Course: ${course.title} (${course.status})`);
        console.log(`  Lessons: ${course.lessons?.length || 0}`);
        if (course.lessons && course.lessons.length > 0) {
          console.log(`  Sample lesson: ${course.lessons[0].title}`);
        }
      });
    }
    
    // 5. Check if there are other enrollment/progress tables
    console.log('\n5. 🔍 Other Possible Progress Tables:');
    const otherTables = [
      'quiz_attempts', 'quiz_progress', 'course_progress', 
      'user_progress', 'student_progress', 'module_progress'
    ];
    
    for (const tableName of otherTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`✅ ${tableName}: ${data?.length || 0} records found`);
          if (data && data.length > 0) {
            console.log(`   Columns:`, Object.keys(data[0]));
          }
        }
      } catch (err) {
        console.log(`❌ ${tableName}: Table doesn't exist`);
      }
    }
    
    // 6. Investigate Los Pellines specific issue
    console.log('\n6. 🏫 Los Pellines Specific Investigation:');
    
    // Get Los Pellines users
    const { data: losUsers } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('school_id', 21); // Los Pellines school_id from previous query
    
    console.log('Los Pellines users:', losUsers?.length || 0);
    
    if (losUsers && losUsers.length > 0) {
      const losUserIds = losUsers.map(u => u.id);
      
      // Check their course assignments
      const { data: losAssignments } = await supabase
        .from('course_assignments')
        .select('*')
        .in('teacher_id', losUserIds);
      
      console.log('Los Pellines course assignments:', losAssignments?.length || 0);
      
      // Check their lesson progress
      const { data: losProgress } = await supabase
        .from('lesson_progress')
        .select('*')
        .in('user_id', losUserIds);
      
      console.log('Los Pellines lesson progress:', losProgress?.length || 0);
      
      // Check their roles
      const { data: losRoles } = await supabase
        .from('user_roles')
        .select('user_id, role_type')
        .in('user_id', losUserIds)
        .eq('is_active', true);
      
      console.log('Los Pellines user roles:');
      losRoles?.forEach(role => {
        const user = losUsers.find(u => u.id === role.user_id);
        console.log(`  ${user?.first_name} ${user?.last_name}: ${role.role_type}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Investigation error:', error);
  }
}

investigateStudentEnrollment();