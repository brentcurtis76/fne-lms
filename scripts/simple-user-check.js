#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkUsers() {
  console.log('👥 Simple User Check\n');
  
  try {
    // Get basic user info
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, community_id')
      .limit(10);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`Found ${users.length} users:`);
    users.forEach((user, i) => {
      console.log(`${i+1}. ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Community: ${user.community_id || 'None'}\n`);
    });

    // Group by community
    const communities = {};
    users.forEach(user => {
      if (user.community_id) {
        if (!communities[user.community_id]) {
          communities[user.community_id] = [];
        }
        communities[user.community_id].push(user);
      }
    });

    console.log('\n📊 Users by Community:');
    Object.entries(communities).forEach(([id, userList]) => {
      console.log(`Community ${id}: ${userList.length} users`);
      if (userList.length >= 2) {
        console.log('  ✅ Good for testing');
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUsers();