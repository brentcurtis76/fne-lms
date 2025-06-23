#!/usr/bin/env node

/**
 * Check the current status of Instagram feed implementation
 * This will help us understand what's already done
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

async function checkPolicies() {
  console.log('🔍 Checking Instagram Feed Status...\n');

  try {
    // 1. Get current policies on community_posts
    console.log('📋 Current Policies on community_posts:');
    let policies = null;
    let policyError = null;
    
    try {
      const result = await supabase.rpc('get_policies_for_table', {
        table_name: 'community_posts'
      });
      policies = result.data;
      policyError = result.error;
    } catch (e) {
      policyError = 'RPC not available';
    }

    if (policyError || !policies) {
      // Fallback: Try to detect policies by attempting operations
      console.log('   (Unable to query policies directly, checking by testing operations...)\n');
      
      // Test SELECT
      const { error: selectError } = await supabase.from('community_posts').select('id').limit(1);
      console.log(`   SELECT: ${selectError ? '❌ ' + selectError.message : '✅ Allowed'}`);
      
      // We can't test INSERT without creating data, so we'll check existing posts
      const { count } = await supabase
        .from('community_posts')
        .select('id', { count: 'exact', head: true });
      console.log(`   Posts in database: ${count || 0}`);
    } else {
      policies.forEach(p => {
        console.log(`   - ${p.policyname} (${p.cmd})`);
      });
    }

    // 2. Check if posts exist
    console.log('\n📊 Post Statistics:');
    const { data: posts, count, error: postError } = await supabase
      .from('community_posts')
      .select('id, type, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5);

    if (postError) {
      console.log(`   ❌ Error querying posts: ${postError.message}`);
    } else {
      console.log(`   Total posts: ${count || 0}`);
      if (posts && posts.length > 0) {
        console.log('   Recent posts:');
        posts.forEach(p => {
          console.log(`     - ${p.type} post created ${new Date(p.created_at).toLocaleDateString()}`);
        });
      }
    }

    // 3. Check view accessibility
    console.log('\n🔎 Checking posts_with_engagement view:');
    const { error: viewError } = await supabase
      .from('posts_with_engagement')
      .select('id')
      .limit(1);
    
    if (viewError) {
      console.log(`   ❌ View error: ${viewError.message}`);
      if (viewError.message.includes('permission denied')) {
        console.log('   💡 Need to grant permissions on the view');
      }
    } else {
      console.log('   ✅ View is accessible');
    }

    // 4. Check storage bucket
    console.log('\n📦 Storage Bucket Status:');
    const { data: buckets } = await supabase.storage.listBuckets();
    const postMediaBucket = buckets?.find(b => b.name === 'post-media');
    
    if (postMediaBucket) {
      console.log('   ✅ post-media bucket exists');
      
      // Try to check bucket policies
      try {
        // Test by trying to list files (will fail if no permissions)
        const { error: listError } = await supabase.storage
          .from('post-media')
          .list('test', { limit: 1 });
        
        if (listError) {
          console.log('   ⚠️  Bucket exists but may need policy configuration');
        } else {
          console.log('   ✅ Bucket policies seem to be configured');
        }
      } catch (e) {
        console.log('   ⚠️  Could not verify bucket policies');
      }
    } else {
      console.log('   ❌ post-media bucket not found');
    }

    // 5. Summary and recommendations
    console.log('\n📝 Summary & Next Steps:');
    console.log('----------------------------');
    
    if (count === 0) {
      console.log('• No posts exist yet - focus on enabling INSERT permissions');
      console.log('• Run the fix-post-creation-updated.sql script');
    } else {
      console.log('• Posts exist! The basic functionality is working');
      console.log('• Check the UI for any remaining issues');
    }
    
    if (viewError) {
      console.log('• Fix view permissions with GRANT statements');
    }
    
    if (!postMediaBucket) {
      console.log('• Create the post-media storage bucket');
    }

    console.log('\n✨ Check complete!');

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

// Add a function to create the RPC if it doesn't exist
async function createPolicyRPC() {
  const rpcSQL = `
CREATE OR REPLACE FUNCTION get_policies_for_table(table_name text)
RETURNS TABLE(
  schemaname name,
  tablename name,
  policyname name,
  permissive text,
  roles name[],
  cmd text,
  qual text,
  with_check text
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM pg_policies WHERE tablename = table_name;
$$;`;

  console.log('Creating helper RPC function...');
  const { error } = await supabase.rpc('query', { sql: rpcSQL }).catch(() => ({ error: 'Unable to create RPC' }));
  if (!error) {
    console.log('✅ Helper function created\n');
  }
}

// Run the check
checkPolicies();