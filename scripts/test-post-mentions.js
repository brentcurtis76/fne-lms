#!/usr/bin/env node

/**
 * Test script for post mention functionality
 * Tests the @mention feature in collaborative space posts
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testPostMentions() {
  try {
    console.log('🧪 Testing post mention functionality...\n');

    // 1. Get test users
    console.log('1️⃣ Getting test users...');
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, community_id')
      .eq('is_active', true)
      .limit(3);

    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }

    if (users.length < 2) {
      console.error('❌ Need at least 2 users to test mentions');
      return;
    }

    const author = users[0];
    const mentioned = users[1];
    console.log(`✅ Author: ${author.first_name} ${author.last_name} (${author.email})`);
    console.log(`✅ To mention: ${mentioned.first_name} ${mentioned.last_name} (${mentioned.email})`);

    // 2. Get the community workspace
    console.log('\n2️⃣ Getting community workspace...');
    const { data: workspace, error: wsError } = await supabase
      .from('community_workspaces')
      .select('id, name')
      .eq('community_id', author.community_id)
      .single();

    if (wsError || !workspace) {
      console.error('❌ Error fetching workspace:', wsError);
      return;
    }
    console.log(`✅ Workspace: ${workspace.name}`);

    // 3. Create a post with a mention
    console.log('\n3️⃣ Creating post with mention...');
    const postContent = {
      text: `¡Hola @${mentioned.first_name} ${mentioned.last_name}! Esta es una prueba de mención en posts.`,
      richText: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '¡Hola ' },
              {
                type: 'mention',
                attrs: {
                  id: mentioned.id,
                  label: `${mentioned.first_name} ${mentioned.last_name}`
                }
              },
              { type: 'text', text: '! Esta es una prueba de mención en posts.' }
            ]
          }
        ]
      }
    };

    const { data: post, error: postError } = await supabase
      .from('community_posts')
      .insert({
        workspace_id: workspace.id,
        author_id: author.id,
        type: 'text',
        content: postContent,
        visibility: 'community'
      })
      .select()
      .single();

    if (postError) {
      console.error('❌ Error creating post:', postError);
      return;
    }
    console.log(`✅ Post created: ${post.id}`);

    // 4. Insert mention record
    console.log('\n4️⃣ Creating mention record...');
    const { error: mentionError } = await supabase
      .from('post_mentions')
      .insert({
        post_id: post.id,
        mentioned_user_id: mentioned.id
      });

    if (mentionError) {
      console.error('❌ Error creating mention:', mentionError);
      return;
    }
    console.log(`✅ Mention record created`);

    // 5. Check if notification was created
    console.log('\n5️⃣ Checking for notification...');
    // Wait a moment for notification to be created
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { data: notifications, error: notifError } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', mentioned.id)
      .eq('category', 'social')
      .order('created_at', { ascending: false })
      .limit(1);

    if (notifError) {
      console.error('❌ Error checking notifications:', notifError);
      return;
    }

    if (notifications && notifications.length > 0) {
      console.log(`✅ Notification created for ${mentioned.first_name}!`);
      console.log(`   Title: ${notifications[0].title}`);
      console.log(`   Description: ${notifications[0].description}`);
      console.log(`   URL: ${notifications[0].related_url}`);
    } else {
      console.log('⚠️  No notification found (may need to trigger manually via the notification service)');
    }

    // 6. Cleanup - delete test post
    console.log('\n6️⃣ Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('community_posts')
      .delete()
      .eq('id', post.id);

    if (deleteError) {
      console.error('⚠️  Could not clean up test post:', deleteError);
    } else {
      console.log('✅ Test post deleted');
    }

    console.log('\n✅ Post mention functionality test completed!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testPostMentions();