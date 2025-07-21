import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCoursesInsert() {
  console.log('Testing courses table insertion...');
  
  try {
    // Attempt to insert a test record
    const { data, error } = await supabase
      .from('courses')
      .insert([
        {
          title: 'Test Course',
          description: 'Test Description',
          instructor_id: '00000000-0000-0000-0000-000000000000', // placeholder UUID for test
          thumbnail_url: 'https://example.com/default-thumbnail.png'
        }
      ])
      .select();
    
    if (error) {
      console.error('ERROR:', error.message);
      console.error('DETAILS:', error);
      
      // Check if it's an RLS policy error
      if (error.message.includes('row-level security')) {
        console.log('\n🔐 Row Level Security Issue:');
        console.log('- Your courses table has RLS policies that are blocking the insert');
        console.log('- The current user does not have permission to insert rows');
      }
    } else {
      console.log('SUCCESS! Inserted data:', data);
    }
  } catch (err) {
    console.error('EXCEPTION:', err);
  }
}

// Run the test
testCoursesInsert();
