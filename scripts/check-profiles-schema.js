require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProfilesSchema() {
  console.log('🔍 Checking Profiles Table Schema');
  console.log('==================================');

  try {
    // Get a sample profile to see what columns exist
    console.log('\n1. Get sample profile with all columns...');
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Error:', error);
      return;
    }

    if (profiles && profiles.length > 0) {
      console.log('✅ Available columns:');
      console.log(Object.keys(profiles[0]));
      console.log('\n📄 Sample profile data:');
      console.log(JSON.stringify(profiles[0], null, 2));
    } else {
      console.log('❌ No profiles found');
    }

  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

checkProfilesSchema();