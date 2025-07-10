const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserStructure() {
  console.log('🔍 Checking user structure...\n');
  
  try {
    // Get users from auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 5
    });
    
    if (authError) {
      console.error('Error getting auth users:', authError);
    } else if (authUsers && authUsers.users) {
      console.log('Auth users found:');
      authUsers.users.forEach(user => {
        console.log(`- ${user.email}`);
        console.log(`  ID: ${user.id}`);
        console.log(`  Created: ${new Date(user.created_at).toLocaleDateString()}\n`);
      });
      
      if (authUsers.users.length > 0) {
        // Use the first user's ID for testing
        const testUserId = authUsers.users[0].id;
        console.log(`\n📝 Test User ID to use: ${testUserId}`);
        console.log(`Email: ${authUsers.users[0].email}`);
        
        // Check if this user has notifications
        const { count, error: countError } = await supabase
          .from('user_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', testUserId);
        
        if (!countError) {
          console.log(`This user has ${count} existing notifications`);
        }
      }
    }
    
    // Also check profiles table structure
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);
    
    if (!profileError && profiles && profiles.length > 0) {
      console.log('\n📋 Profile table columns:');
      console.log(Object.keys(profiles[0]).join(', '));
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserStructure()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script error:', err);
    process.exit(1);
  });