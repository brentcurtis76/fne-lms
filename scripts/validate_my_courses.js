const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function verifyMyCoursesApi() {
  console.log('Verifying my-courses API logic...');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Find a user with enrollments
  const { data: enrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('user_id')
    .limit(1);

  if (enrollError) {
    console.error('Error finding enrollments:', enrollError);
    return;
  }

  if (!enrollments || enrollments.length === 0) {
    console.log('No enrollments found in the database to test with.');
    return;
  }

  const testUserId = enrollments[0].user_id;
  console.log(`Testing with user ID: ${testUserId}`);

  // 2. Simulate the API query
  const { data: userEnrollments, error: queryError } = await supabase
    .from('course_enrollments')
    .select(`
      progress_percentage,
      lessons_completed,
      total_lessons,
      updated_at,
      created_at,
      courses (
        id,
        title,
        description,
        thumbnail_url
      )
    `)
    .eq('user_id', testUserId)
    .order('updated_at', { ascending: false });

  if (queryError) {
    console.error('Error querying user enrollments:', queryError);
    return;
  }

  console.log(`Found ${userEnrollments.length} enrollments for user.`);

  // 3. Verify data structure
  if (userEnrollments.length > 0) {
    const first = userEnrollments[0];
    console.log('Sample enrollment data:', JSON.stringify(first, null, 2));

    if (!first.courses) {
      console.error('FAIL: Course data missing from join');
    } else {
      console.log('PASS: Course data joined successfully');
    }

    if (typeof first.progress_percentage !== 'number') {
      console.warn('WARNING: progress_percentage is not a number');
    } else {
      console.log('PASS: progress_percentage is present');
    }
  }

  console.log('Verification complete.');
}

verifyMyCoursesApi();
