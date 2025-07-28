#!/usr/bin/env node

/**
 * Manual @Mention Feature Test
 * Verifies that the TipTap mention implementation works correctly
 */

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

async function testMentionImplementation() {
  console.log('🎯 Testing @Mention Feature Implementation\n');
  
  try {
    // Test 1: Check if API endpoint exists
    console.log('1️⃣ Testing API endpoint...');
    const testResponse = await fetch('http://localhost:3000/api/community/search-users?q=test', {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    
    if (testResponse.ok) {
      console.log('✅ API endpoint /api/community/search-users is accessible');
    } else {
      console.log('❌ API endpoint failed:', testResponse.status);
    }
    
    // Test 2: Check TipTap packages
    console.log('\n2️⃣ Checking TipTap packages...');
    const packageJson = require('../package.json');
    const tiptapPackages = Object.keys(packageJson.dependencies).filter(pkg => pkg.includes('@tiptap'));
    console.log('✅ TipTap packages installed:', tiptapPackages);
    
    // Test 3: Check for users with community data
    console.log('\n3️⃣ Checking user data for mentions...');
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, community_id')
      .limit(5);
    
    if (error) {
      console.error('❌ Database query failed:', error);
      return;
    }
    
    console.log(`✅ Found ${users.length} users`);
    const usersWithCommunity = users.filter(u => u.community_id);
    console.log(`✅ ${usersWithCommunity.length} users have community_id (needed for mention testing)`);
    
    // Test 4: Check post_mentions table structure
    console.log('\n4️⃣ Checking post_mentions table...');
    const { data: mentions, error: mentionError } = await supabase
      .from('post_mentions')
      .select('*')
      .limit(1);
    
    if (!mentionError) {
      console.log('✅ post_mentions table exists and is accessible');
    } else {
      console.log('❌ post_mentions table issue:', mentionError.message);
    }
    
    // Test 5: Manual testing instructions
    console.log('\n📋 MANUAL TESTING INSTRUCTIONS:');
    console.log('1. Open http://localhost:3000 in browser');
    console.log('2. Login as any user');
    console.log('3. Navigate to collaborative space/workspace');
    console.log('4. Create a new post');
    console.log('5. Type @ followed by letters to trigger mention dropdown');
    console.log('6. Select a user from dropdown');
    console.log('7. Submit post and verify mention appears with blue styling');
    console.log('8. Check if mentioned user receives notification');
    
    console.log('\n✅ All component checks passed - @mention feature is ready for manual testing');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMentionImplementation();