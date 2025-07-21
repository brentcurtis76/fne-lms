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

async function checkCourses() {
  console.log('Checking courses table directly...\n');

  try {
    // First, check if courses table exists and has data
    const { data: courses, error: coursesError, count } = await supabaseAdmin
      .from('courses')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    if (coursesError) {
      console.error('Error fetching courses:', coursesError);
      return;
    }

    console.log(`Total courses in table: ${count}`);
    console.log('\nFirst 5 courses:');
    console.log('---------------');
    
    if (courses && courses.length > 0) {
      courses.forEach((course, index) => {
        console.log(`\n${index + 1}. ${course.title}`);
        console.log(`   ID: ${course.id}`);
        console.log(`   Created by: ${course.created_by}`);
        console.log(`   Published: ${course.is_published}`);
        console.log(`   Created at: ${course.created_at}`);
      });
    } else {
      console.log('No courses found in the table!');
    }

    // Check for Brent's courses specifically
    const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
    const { data: brentCourses, error: brentError } = await supabaseAdmin
      .from('courses')
      .select('id, title, is_published, created_at')
      .eq('created_by', userId);

    console.log(`\n\nCourses created by Brent (${userId}):`);
    console.log('----------------------------------------');
    
    if (brentCourses && brentCourses.length > 0) {
      brentCourses.forEach(course => {
        console.log(`- ${course.title} (Published: ${course.is_published})`);
      });
    } else {
      console.log('No courses found for Brent!');
    }

    // Check RLS status
    const { data: rlsStatus, error: rlsError } = await supabaseAdmin
      .rpc('get_rls_status', { table_name: 'courses' })
      .single()
      .catch(() => ({ data: null, error: 'Function not found' }));

    console.log('\n\nRLS Status for courses table:');
    console.log('----------------------------');
    if (rlsStatus) {
      console.log('RLS enabled:', rlsStatus);
    } else {
      // Try alternative way to check RLS
      const { data: tableInfo } = await supabaseAdmin
        .from('pg_tables')
        .select('*')
        .eq('tablename', 'courses')
        .single()
        .catch(() => ({ data: null }));
      
      console.log('Table exists:', !!tableInfo);
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkCourses();