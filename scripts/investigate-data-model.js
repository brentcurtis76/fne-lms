const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateDataModel() {
  console.log('🔍 Complete Data Model Investigation');
  console.log('=====================================');
  
  try {
    // 1. Check Los Pellines school specifically
    console.log('\n1. 📍 Los Pellines School Investigation:');
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('*')
      .ilike('name', '%pellines%');
    
    if (schoolsError) {
      console.error('❌ Schools error:', schoolsError);
    } else {
      console.log('✅ Los Pellines school found:', schools?.length || 0);
      if (schools && schools.length > 0) {
        console.log('School details:', schools[0]);
        
        // Get users from Los Pellines
        const { data: losUsersData, error: losUsersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, school_id')
          .eq('school_id', schools[0].id);
        
        if (losUsersError) {
          console.error('❌ Los Pellines users error:', losUsersError);
        } else {
          console.log('✅ Los Pellines users found:', losUsersData?.length || 0);
          console.log('Sample Los Pellines users:', losUsersData?.slice(0, 3));
        }
      }
    }
    
    // 2. Check lesson progress data
    console.log('\n2. 📚 Lesson Progress Investigation:');
    const lessonProgressTables = ['lesson_progress', 'user_lesson_progress', 'lesson_completions'];
    
    for (const tableName of lessonProgressTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(3);
        
        if (error) {
          console.log(`❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`✅ ${tableName}: ${data?.length || 0} records found`);
          if (data && data.length > 0) {
            console.log(`   Sample record:`, data[0]);
            console.log(`   Columns:`, Object.keys(data[0]));
          }
        }
      } catch (err) {
        console.log(`❌ ${tableName}: ${err.message}`);
      }
    }
    
    // 3. Check student enrollment vs teacher assignment
    console.log('\n3. 👨‍🎓 Student vs Teacher Course Relationship:');
    
    // Teacher assignments (we already know this exists)
    const { data: teacherAssignments } = await supabase
      .from('course_assignments')
      .select('teacher_id, course_id, status, progress_percentage')
      .limit(5);
    console.log('✅ Teacher assignments found:', teacherAssignments?.length || 0);
    
    // Check if there's a separate student enrollment system
    const studentTables = ['student_enrollments', 'course_students', 'user_course_enrollments'];
    
    for (const tableName of studentTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(3);
        
        if (error) {
          console.log(`❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`✅ ${tableName}: ${data?.length || 0} records found`);
          if (data && data.length > 0) {
            console.log(`   Sample record:`, data[0]);
          }
        }
      } catch (err) {
        console.log(`❌ ${tableName}: ${err.message}`);
      }
    }
    
    // 4. Check all tables with 'lesson' in the name
    console.log('\n4. 📖 All Lesson-Related Tables:');
    const allTables = [
      'lessons', 'lesson_progress', 'lesson_completions', 'lesson_assignments',
      'user_lessons', 'course_lessons', 'lesson_attempts'
    ];
    
    for (const tableName of allTables) {
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
    
    // 5. Check course structure
    console.log('\n5. 🎯 Course and Lesson Relationship:');
    const { data: coursesWithLessons, error: courseLessonsError } = await supabase
      .from('courses')
      .select(`
        id, 
        title,
        lessons:lessons(id, title, order_index)
      `)
      .limit(2);
    
    if (courseLessonsError) {
      console.error('❌ Course-lessons relationship error:', courseLessonsError);
    } else {
      console.log('✅ Courses with lessons:', coursesWithLessons?.length || 0);
      if (coursesWithLessons && coursesWithLessons.length > 0) {
        console.log('Sample course with lessons:', JSON.stringify(coursesWithLessons[0], null, 2));
      }
    }
    
    // 6. Check user roles to understand who should appear in reports
    console.log('\n6. 👥 User Role Distribution:');
    const { data: roleDistribution } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('is_active', true);
    
    const roleCounts = {};
    roleDistribution?.forEach(role => {
      roleCounts[role.role_type] = (roleCounts[role.role_type] || 0) + 1;
    });
    
    console.log('Role distribution:', roleCounts);
    
    // 7. Investigate the current API logic issue
    console.log('\n7. 🔧 Current API Logic Analysis:');
    
    // Test what our current API would return for Los Pellines users
    if (schools && schools.length > 0) {
      const { data: losProfiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, school_id')
        .eq('school_id', schools[0].id);
      
      if (losProfiles && losProfiles.length > 0) {
        const losUserIds = losProfiles.map(p => p.id);
        
        // Check course assignments for Los Pellines users
        const { data: losAssignments } = await supabase
          .from('course_assignments')
          .select('teacher_id, course_id, progress_percentage, status')
          .in('teacher_id', losUserIds);
        
        console.log('Los Pellines users in course_assignments:', losAssignments?.length || 0);
        console.log('Sample Los Pellines assignment:', losAssignments?.[0]);
      }
    }
    
  } catch (error) {
    console.error('❌ Investigation error:', error);
  }
}

investigateDataModel();