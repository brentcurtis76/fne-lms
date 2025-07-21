const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function verifyCoursesData() {
  console.log('Verifying courses data...\n');

  try {
    // 1. Check courses table
    const { count: coursesCount } = await supabaseAdmin
      .from('courses')
      .select('*', { count: 'exact', head: true });
    
    console.log(`1. Courses table count: ${coursesCount}`);

    // 2. Check if there are any lessons (maybe courses were deleted but lessons remain)
    const { count: lessonsCount } = await supabaseAdmin
      .from('lessons')
      .select('*', { count: 'exact', head: true });
    
    console.log(`2. Lessons table count: ${lessonsCount}`);

    // 3. Check course_assignments (maybe there's history of courses)
    const { count: assignmentsCount } = await supabaseAdmin
      .from('course_assignments')
      .select('*', { count: 'exact', head: true });
    
    console.log(`3. Course assignments count: ${assignmentsCount}`);

    // 4. Check if there are any course-related tables
    const { data: tables } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', '%course%')
      .order('table_name');

    console.log('\n4. Tables with "course" in name:');
    if (tables && tables.length > 0) {
      tables.forEach(t => console.log(`   - ${t.table_name}`));
    }

    // 5. Check audit logs for course creation/deletion
    const { data: courseLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .or('table_name.eq.courses,action.ilike.%course%')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\n5. Recent audit logs related to courses:');
    if (courseLogs && courseLogs.length > 0) {
      courseLogs.forEach(log => {
        console.log(`   - ${log.created_at}: ${log.action} on ${log.table_name} by ${log.user_id}`);
      });
    } else {
      console.log('   No course-related audit logs found');
    }

    // 6. Check activity feed for course creation
    const { data: activities } = await supabaseAdmin
      .from('user_activities')
      .select('*')
      .eq('activity_type', 'course_created')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n6. Recent course creation activities:');
    if (activities && activities.length > 0) {
      activities.forEach(act => {
        console.log(`   - ${act.created_at}: User ${act.user_id} created course ${act.metadata?.course_id}`);
      });
    } else {
      console.log('   No course creation activities found');
    }

    console.log('\n\nCONCLUSION:');
    console.log('===========');
    if (coursesCount === 0) {
      console.log('The courses table is empty. This is why no courses appear in the dashboard.');
      console.log('This is NOT an RLS policy issue - there are simply no courses in the database.');
      console.log('\nTo fix this, you need to create some courses using the course builder.');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

verifyCoursesData();