const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDaniel() {
  console.log('Searching for Daniel in auth.users...\n');

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.log('Error:', error);
    return;
  }

  // Search for users with "daniel" or "llolleo" in email
  const matches = data.users.filter(u =>
    u.email.toLowerCase().includes('daniel') ||
    u.email.toLowerCase().includes('llolleo')
  );

  console.log(`Found ${matches.length} matching users:\n`);

  matches.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`ID: ${user.id}`);
    console.log(`Created: ${user.created_at}`);
    console.log(`Last sign in: ${user.last_sign_in_at || 'Never'}`);
    console.log('---');
  });

  // Also check the exact course ID from the error
  const courseId = 'cfb259f8-5e59-4a2f-a842-a36f2f84ef90';
  console.log(`\nChecking course ${courseId}...\n`);

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (courseError) {
    console.log('❌ Course query failed:', courseError.message);
    console.log('Error code:', courseError.code);
    console.log('Error details:', courseError.details);
  } else {
    console.log('✅ Course found:', course.title);
  }
}

findDaniel().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
