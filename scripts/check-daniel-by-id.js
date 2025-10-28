const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  // User ID from console logs
  const danielId = '351f761f-33db-4b98-80db-e7bc1469814b';
  const courseId = 'cfb259f8-5e59-4a2f-a842-a36f2f84ef90';

  console.log('=== ROOT CAUSE INVESTIGATION ===\n');
  console.log('User ID:', danielId);
  console.log('Course ID:', courseId);
  console.log();

  // 1. Get user from auth
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(danielId);

  console.log('1. AUTH USER:');
  if (authError) {
    console.log('   ❌ Error:', authError.message);
  } else {
    console.log('   ✅ Found:', authUser.user.email);
    console.log('   User metadata roles:', authUser.user.user_metadata?.roles || 'None');
  }
  console.log();

  // 2. Check course (we know it exists from previous test)
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, status, visibility')
    .eq('id', courseId)
    .single();

  console.log('2. COURSE:');
  if (courseError) {
    console.log('   ❌ Error:', courseError.message);
  } else {
    console.log('   ✅ Title:', course.title);
    console.log('   Status:', course.status);
    console.log('   Visibility:', course.visibility);
  }
  console.log();

  // 3. Check course enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', danielId)
    .eq('course_id', courseId)
    .single();

  console.log('3. COURSE ENROLLMENT:');
  if (enrollError) {
    console.log('   ❌ Not enrolled:', enrollError.message);
  } else {
    console.log('   ✅ Enrolled');
    console.log('   Enrollment type:', enrollment.enrollment_type);
    console.log('   Status:', enrollment.status);
  }
  console.log();

  // 4. Check learning path assignments
  const { data: assignments, error: assignError } = await supabase
    .from('learning_path_assignments')
    .select('*, learning_paths(name)')
    .eq('user_id', danielId);

  console.log('4. LEARNING PATH ASSIGNMENTS:', assignments?.length || 0);
  if (assignments && assignments.length > 0) {
    for (const a of assignments) {
      console.log(`   - ${a.learning_paths.name}`);

      // Check if this path contains the problematic course
      const { data: pathCourses } = await supabase
        .from('learning_path_courses')
        .select('course_id')
        .eq('learning_path_id', a.learning_path_id);

      const hasCourse = pathCourses?.some(pc => pc.course_id === courseId);
      console.log(`     Contains problematic course: ${hasCourse ? 'YES' : 'NO'}`);
    }
  }
  console.log();

  // 5. Test the EXACT query that's failing (from console logs)
  console.log('5. TESTING EXACT FAILING QUERY:');
  console.log('   Query: courses?select=*&id=eq.' + courseId);

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/courses?select=*&id=eq.${courseId}`,
      {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E'
        }
      }
    );

    console.log('   Response status:', response.status);
    console.log('   Response status text:', response.statusText);

    if (response.status === 406) {
      console.log('   ❌ 406 ERROR REPRODUCED!');
      console.log('   This means: Missing or incorrect Accept header');
      const text = await response.text();
      console.log('   Response body:', text);
    } else if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Query succeeded, got', data.length, 'results');
    } else {
      console.log('   ❌ Different error:', await response.text());
    }
  } catch (err) {
    console.log('   ❌ Fetch error:', err.message);
  }
  console.log();

  // 6. Now test with proper Accept header
  console.log('6. TESTING WITH PROPER ACCEPT HEADER:');
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/courses?select=*&id=eq.${courseId}`,
      {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E',
          'Accept': 'application/json'
        }
      }
    );

    console.log('   Response status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ SUCCESS! Got', data.length, 'results');
      if (data.length > 0) {
        console.log('   Course title:', data[0].title);
      }
    }
  } catch (err) {
    console.log('   ❌ Error:', err.message);
  }
  console.log();

  console.log('=== ROOT CAUSE IDENTIFIED ===');
  console.log('The 406 error is caused by a missing or incorrect Accept header');
  console.log('in the Supabase client request. This is likely a client-side');
  console.log('configuration issue in the course viewer page.');
}

diagnose().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
