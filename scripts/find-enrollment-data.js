const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findEnrollmentData() {
  console.log('🔍 Finding where course assignment data is actually stored...');
  
  try {
    // Check all tables that might contain enrollment/assignment data
    const tablesToCheck = [
      'course_enrollments',
      'course_assignments', 
      'user_courses',
      'enrollments',
      'assignments',
      'course_participants',
      'course_users'
    ];
    
    for (const tableName of tablesToCheck) {
      console.log(`\n📋 Checking table: ${tableName}`);
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
    
    // Check the courses table for more details
    console.log('\n📚 Detailed courses check:');
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .limit(2);
      
    if (coursesError) {
      console.error('❌ Courses error:', coursesError);
    } else {
      console.log('✅ Sample course data:');
      if (courses && courses.length > 0) {
        console.log(courses[0]);
        console.log('Course columns:', Object.keys(courses[0]));
      }
    }
    
    // Check the actual course_enrollments table more thoroughly
    console.log('\n🎯 Deep dive into course_enrollments:');
    const { count, error: countError } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Count error:', countError);
    } else {
      console.log('Total course_enrollments count:', count);
    }
    
    // Check table schema information
    console.log('\n🏗️  Checking table schema info:');
    const { data: tableInfo, error: infoError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', '%course%');
    
    if (infoError) {
      console.error('❌ Schema error:', infoError);
    } else {
      console.log('Tables with "course" in name:', tableInfo?.map(t => t.table_name));
    }
    
  } catch (error) {
    console.error('❌ Find enrollment data error:', error);
  }
}

findEnrollmentData();