/**
 * Verify Instagram feed tables are properly set up
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyFeedTables() {
  console.log('🔍 Verifying Instagram feed database setup...\n');

  const tables = [
    'community_posts',
    'post_reactions',
    'post_comments',
    'post_media',
    'post_mentions',
    'post_hashtags',
    'saved_posts'
  ];

  const views = [
    'posts_with_engagement'
  ];

  let allGood = true;

  // Check tables
  console.log('📊 Checking tables:');
  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`  ❌ ${table} - NOT FOUND`);
        allGood = false;
      } else {
        console.log(`  ✅ ${table} - EXISTS`);
      }
    } catch (e) {
      console.log(`  ❌ ${table} - ERROR: ${e.message}`);
      allGood = false;
    }
  }

  // Check views
  console.log('\n📊 Checking views:');
  for (const view of views) {
    try {
      const { error } = await supabase
        .from(view)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`  ❌ ${view} - NOT FOUND`);
        allGood = false;
      } else {
        console.log(`  ✅ ${view} - EXISTS`);
      }
    } catch (e) {
      console.log(`  ❌ ${view} - ERROR: ${e.message}`);
      allGood = false;
    }
  }

  // Check storage bucket
  console.log('\n📦 Checking storage:');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log(`  ❌ Could not list buckets: ${error.message}`);
    } else {
      const postMediaBucket = buckets?.find(b => b.name === 'post-media');
      if (postMediaBucket) {
        console.log('  ✅ post-media bucket - EXISTS');
      } else {
        console.log('  ❌ post-media bucket - NOT FOUND');
        allGood = false;
      }
    }
  } catch (e) {
    console.log(`  ❌ Storage check error: ${e.message}`);
  }

  console.log('\n' + '='.repeat(50));
  
  if (allGood) {
    console.log('✅ All Instagram feed components are properly set up!');
  } else {
    console.log('❌ Some components are missing. Please run:');
    console.log('   1. The SQL script in /database/add-instagram-feed-tables.sql');
    console.log('   2. Set up storage policies for the post-media bucket');
  }
}

verifyFeedTables();