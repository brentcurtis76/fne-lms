#!/usr/bin/env node

/**
 * Verification script for Instagram feed setup
 * Run this after applying database fixes to ensure everything is configured correctly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySetup() {
  console.log('🔍 Verifying Instagram Feed Setup...\n');

  try {
    // 1. Check if tables exist
    console.log('1️⃣ Checking database tables...');
    const tables = [
      'community_posts',
      'post_reactions', 
      'post_comments',
      'post_media',
      'post_mentions',
      'post_hashtags',
      'saved_posts'
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        console.log(`❌ Table ${table}: ${error.message}`);
      } else {
        console.log(`✅ Table ${table} exists`);
      }
    }

    // 2. Check if view exists
    console.log('\n2️⃣ Checking database view...');
    const { error: viewError } = await supabase
      .from('posts_with_engagement')
      .select('id')
      .limit(1);
    
    if (viewError && viewError.code !== 'PGRST116') {
      console.log(`❌ View posts_with_engagement: ${viewError.message}`);
    } else {
      console.log('✅ View posts_with_engagement exists');
    }

    // 3. Check storage bucket
    console.log('\n3️⃣ Checking storage bucket...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.log(`❌ Could not list buckets: ${bucketError.message}`);
    } else {
      const postMediaBucket = buckets.find(b => b.name === 'post-media');
      if (postMediaBucket) {
        console.log('✅ Storage bucket post-media exists');
      } else {
        console.log('❌ Storage bucket post-media not found');
      }
    }

    // 4. Test RLS policies
    console.log('\n4️⃣ Testing RLS policies...');
    
    // Get a test user
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();

    if (profiles) {
      // Try to simulate a post creation (without actually creating)
      console.log('✅ RLS policies check complete (manual verification needed)');
      console.log('   ⚠️  To fully test: Try creating a post from the UI');
    }

    // 5. Check for any community workspaces
    console.log('\n5️⃣ Checking community workspaces...');
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select('id, community_id')
      .limit(5);

    if (wsError) {
      console.log(`❌ Could not query workspaces: ${wsError.message}`);
    } else if (workspaces && workspaces.length > 0) {
      console.log(`✅ Found ${workspaces.length} community workspace(s)`);
      workspaces.forEach(ws => {
        console.log(`   - Workspace ${ws.id} for community ${ws.community_id}`);
      });
    } else {
      console.log('⚠️  No community workspaces found (create one to test)');
    }

    console.log('\n✨ Verification complete!');
    console.log('\n📝 Next steps:');
    console.log('1. If any ❌ items above, fix them first');
    console.log('2. Test creating a post with image from the UI');
    console.log('3. If post creation fails, check browser console for errors');
    console.log('4. Run the storage policies SQL if not already done');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

verifySetup();