const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLessonsStructure() {
  console.log('Checking lessons table structure...\n');

  try {
    // Get one lesson to see its structure
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching lesson:', error);
      return;
    }

    console.log('Lesson structure:');
    console.log(Object.keys(lesson));
    console.log('\nSample lesson:');
    console.log(JSON.stringify(lesson, null, 2));

  } catch (error) {
    console.error('Failed:', error);
  }
}

checkLessonsStructure();