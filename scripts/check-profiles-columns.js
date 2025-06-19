const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
  // Get a sample profile to see structure
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)
    .single();
    
  if (data) {
    console.log('Profile columns:', Object.keys(data));
  } else {
    console.log('Error or no data:', error);
  }
}

checkColumns();