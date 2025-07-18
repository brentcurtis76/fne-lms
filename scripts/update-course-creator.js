require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function updateCourseCreator() {
  console.log('Updating course creator for "Introducción a Los Pellines"...\n');

  // First, verify the course exists
  const { data: course, error: fetchError } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('id', '72191f5b-a66a-422f-8d6a-51b27543ded1')
    .single();

  if (fetchError) {
    console.error('Error fetching course:', fetchError);
    return;
  }

  console.log('Current course details:');
  console.log(`- ID: ${course.id}`);
  console.log(`- Title: ${course.title}`);
  console.log(`- Current created_by: ${course.created_by}\n`);

  // Update the course creator
  const { error: updateError } = await supabase
    .from('courses')
    .update({ created_by: '372ab00b-1d39-4574-8eff-d756b9d6b861' })
    .eq('id', '72191f5b-a66a-422f-8d6a-51b27543ded1');

  if (updateError) {
    console.error('Error updating course:', updateError);
    return;
  }

  console.log('✅ Course updated successfully!\n');

  // Verify the update
  const { data: updatedCourse, error: verifyError } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('id', '72191f5b-a66a-422f-8d6a-51b27543ded1')
    .single();

  if (verifyError) {
    console.error('Error verifying update:', verifyError);
    return;
  }

  console.log('Updated course details:');
  console.log(`- ID: ${updatedCourse.id}`);
  console.log(`- Title: ${updatedCourse.title}`);
  console.log(`- New created_by: ${updatedCourse.created_by}`);

  // Also verify Jorge Parra user exists
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('id', '372ab00b-1d39-4574-8eff-d756b9d6b861')
    .single();

  if (userError) {
    console.error('\nWarning: Could not verify Jorge Parra user:', userError);
  } else {
    console.log('\n✅ Verified course creator:');
    console.log(`- Name: ${user.first_name} ${user.last_name}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- ID: ${user.id}`);
  }
}

updateCourseCreator().catch(console.error);