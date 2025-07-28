/**
 * Get a valid user ID from the database
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getValidUser() {
  console.log('🔍 Getting valid user from database...');
  
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .limit(5);
      
    if (error) {
      console.error('❌ Error fetching users:', error);
      return;
    }
    
    console.log(`✅ Found ${users?.length || 0} users:`);
    users?.forEach(user => {
      console.log(`   ${user.id}: ${user.first_name} ${user.last_name} (${user.email})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

getValidUser();