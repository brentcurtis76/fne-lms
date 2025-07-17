#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchemaRefresh() {
  console.log('⏳ Checking if schema cache has been refreshed...\n');

  const testUserId = '40aff5c7-90de-4be0-ade3-dcb93bca7e3d'; // Your user ID

  const { data, error } = await supabase
    .rpc('create_full_learning_path', {
      p_name: 'Schema Test Path',
      p_description: 'Testing if schema cache is refreshed',
      p_course_ids: [],
      p_created_by: testUserId
    });

  if (error) {
    if (error.message.includes('schema cache')) {
      console.log('❌ Schema cache not refreshed yet.');
      console.log('⏳ PostgREST is still refreshing. Wait another minute and try again.');
      console.log('\nTo check manually: Try creating a learning path in the UI.');
    } else {
      console.log('✅ Schema cache refreshed! But got different error:');
      console.log('Error:', error.message);
      console.log('\nThis means the RPC function is now accessible.');
      console.log('The error above is likely a permission or data validation issue.');
    }
  } else {
    console.log('✅ Success! Schema cache is refreshed and working!');
    console.log('Created test learning path:', data);
    
    // Clean up the test path
    if (data && data.id) {
      await supabase
        .from('learning_paths')
        .delete()
        .eq('id', data.id);
      console.log('🧹 Cleaned up test learning path.');
    }
  }
}

// Run the check every 30 seconds for 2 minutes
let attempts = 0;
const maxAttempts = 4;

function runCheck() {
  attempts++;
  console.log(`\n📍 Attempt ${attempts} of ${maxAttempts}:`);
  
  checkSchemaRefresh().then(() => {
    if (attempts < maxAttempts) {
      console.log('\nWaiting 30 seconds before next check...');
      setTimeout(runCheck, 30000);
    } else {
      console.log('\n🏁 Finished checking. If still not working, try manually in Supabase dashboard.');
    }
  });
}

runCheck();