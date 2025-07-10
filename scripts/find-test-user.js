const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findTestUser() {
  console.log('🔍 Finding test user...\n');
  
  try {
    // Try to find Brent Curtis by email
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, user_id, email, first_name, last_name')
      .ilike('email', '%brent%')
      .limit(5);
    
    if (error) {
      console.error('Error finding users:', error);
      return;
    }
    
    if (users && users.length > 0) {
      console.log('Found users:');
      users.forEach(user => {
        console.log(`- ${user.first_name || 'No name'} ${user.last_name || ''} (${user.email})`);
        console.log(`  ID: ${user.id}`);
        console.log(`  User ID: ${user.user_id}\n`);
      });
      
      // Also check if they have any existing notifications
      const testUserId = users[0].user_id;
      const { count, error: countError } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', testUserId);
      
      if (!countError) {
        console.log(`First user has ${count} existing notifications`);
      }
    } else {
      console.log('No users found with "brent" in email');
      
      // Get any user for testing
      const { data: anyUsers, error: anyError } = await supabase
        .from('profiles')
        .select('id, user_id, email, first_name, last_name')
        .not('user_id', 'is', null)
        .limit(5);
      
      if (!anyError && anyUsers && anyUsers.length > 0) {
        console.log('\nOther available users:');
        anyUsers.forEach(user => {
          console.log(`- ${user.first_name || 'No name'} ${user.last_name || ''} (${user.email})`);
          console.log(`  User ID: ${user.user_id}\n`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findTestUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script error:', err);
    process.exit(1);
  });