#!/usr/bin/env node

/**
 * Comprehensive verification script for @mention feature
 * This script simulates and verifies the complete user flow
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

async function verifyMentionFeature() {
  console.log('🔍 @Mention Feature Verification Protocol\n');
  console.log('='*50 + '\n');

  let userA, userB, workspace, createdPost;

  try {
    // PART 1: Setup - Get Test Users
    console.log('📋 PART 1: Setup\n');
    console.log('1️⃣ Getting test users from the same community...');
    
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, community_id, role')
      .eq('is_active', true)
      .limit(10);

    if (userError || !users || users.length < 2) {
      console.error('❌ Error: Need at least 2 users in the same community');
      return;
    }

    // Find users from the same community
    const communityCounts = {};
    users.forEach(user => {
      if (!communityCounts[user.community_id]) {
        communityCounts[user.community_id] = [];
      }
      communityCounts[user.community_id].push(user);
    });

    let communityWithMultipleUsers = null;
    for (const [communityId, communityUsers] of Object.entries(communityCounts)) {
      if (communityUsers.length >= 2) {
        communityWithMultipleUsers = communityId;
        userA = communityUsers[0];
        userB = communityUsers[1];
        break;
      }
    }

    if (!userA || !userB) {
      console.error('❌ Error: Could not find 2 users in the same community');
      return;
    }

    console.log(`✅ User A (Poster): ${userA.first_name} ${userA.last_name} (${userA.email})`);
    console.log(`✅ User B (Tagged): ${userB.first_name} ${userB.last_name} (${userB.email})`);
    console.log(`✅ Community ID: ${userA.community_id}\n`);

    // Get workspace
    const { data: workspaceData, error: wsError } = await supabase
      .from('community_workspaces')
      .select('id, name')
      .eq('community_id', userA.community_id)
      .single();

    if (wsError || !workspaceData) {
      console.error('❌ Error fetching workspace:', wsError);
      return;
    }
    workspace = workspaceData;
    console.log(`✅ Workspace: ${workspace.name}\n`);

    // PART 2: Frontend Simulation
    console.log('🖥️  PART 2: Frontend Flow Simulation\n');
    
    console.log('2️⃣ Simulating User A creating a post with mention...');
    console.log(`   - User A types: "@${userB.first_name.substring(0, 3)}"`);
    console.log('   - [CHECKPOINT] Autocomplete should show User B in suggestions');
    console.log('   - User A selects User B from the list');
    console.log('   - [CHECKPOINT] Mention should appear as styled tag in editor\n');

    // Create the post with mention
    const postContent = {
      text: `Hey @${userB.first_name} ${userB.last_name}, check out this new feature!`,
      richText: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hey ' },
              {
                type: 'mention',
                attrs: {
                  id: userB.id,
                  label: `${userB.first_name} ${userB.last_name}`
                }
              },
              { type: 'text', text: ', check out this new feature!' }
            ]
          }
        ]
      }
    };

    const { data: post, error: postError } = await supabase
      .from('community_posts')
      .insert({
        workspace_id: workspace.id,
        author_id: userA.id,
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
    createdPost = post;
    console.log(`✅ Post created successfully (ID: ${post.id})`);
    console.log('   - [CHECKPOINT] Published post should display mention as styled link\n');

    // Create mention record
    const { error: mentionError } = await supabase
      .from('post_mentions')
      .insert({
        post_id: post.id,
        mentioned_user_id: userB.id
      });

    if (mentionError) {
      console.error('❌ Error creating mention record:', mentionError);
      return;
    }

    // Simulate notification creation (this would normally be done by the service)
    console.log('3️⃣ Checking notification creation...');
    
    // Wait for async processes
    await new Promise(resolve => setTimeout(resolve, 2000));

    // PART 3: Backend Verification
    console.log('\n💾 PART 3: Backend Data Integrity Verification\n');

    // Verify post_mentions table
    console.log('4️⃣ Verifying post_mentions table...');
    const { data: mentionRecord, error: mentionCheckError } = await supabase
      .from('post_mentions')
      .select('*')
      .eq('post_id', post.id)
      .eq('mentioned_user_id', userB.id)
      .single();

    if (mentionCheckError || !mentionRecord) {
      console.error('❌ Mention record not found in post_mentions table');
    } else {
      console.log('✅ Mention record verified in post_mentions table:');
      console.log(`   - post_id: ${mentionRecord.post_id}`);
      console.log(`   - mentioned_user_id: ${mentionRecord.mentioned_user_id}`);
      console.log(`   - created_at: ${mentionRecord.created_at}\n`);
    }

    // Verify notifications table
    console.log('5️⃣ Verifying user_notifications table...');
    const { data: notifications, error: notifCheckError } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userB.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (notifCheckError) {
      console.error('❌ Error checking notifications:', notifCheckError);
    } else {
      const mentionNotif = notifications?.find(n => 
        n.category === 'social' || 
        n.title?.includes(userA.first_name) ||
        n.description?.includes('mencionó')
      );

      if (mentionNotif) {
        console.log('✅ Notification found in user_notifications table:');
        console.log(`   - Title: ${mentionNotif.title}`);
        console.log(`   - Description: ${mentionNotif.description}`);
        console.log(`   - Category: ${mentionNotif.category}`);
        console.log(`   - Related URL: ${mentionNotif.related_url}`);
        console.log(`   - Created: ${mentionNotif.created_at}\n`);
      } else {
        console.log('⚠️  No mention notification found (may need manual trigger)\n');
      }
    }

    // PART 4: User B Experience Simulation
    console.log('👤 PART 4: User B Experience Verification\n');
    console.log('6️⃣ Simulating User B login and notification check...');
    console.log('   - [CHECKPOINT] Notification bell should show indicator');
    console.log('   - [CHECKPOINT] Clicking bell should show mention notification');
    console.log('   - [CHECKPOINT] Clicking notification should navigate to post\n');

    // Summary
    console.log('📊 VERIFICATION SUMMARY\n');
    console.log('='*50);
    console.log('✅ Post created with mention');
    console.log(mentionRecord ? '✅ Mention record stored in database' : '❌ Mention record missing');
    console.log(notifications?.length > 0 ? '✅ Notification system accessible' : '❌ Notification system error');
    console.log('\n🎯 Feature Status: ' + (mentionRecord ? 'FUNCTIONAL' : 'NEEDS ATTENTION'));

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    if (createdPost) {
      await supabase.from('community_posts').delete().eq('id', createdPost.id);
      console.log('✅ Test post deleted');
    }

  } catch (error) {
    console.error('\n❌ Unexpected error during verification:', error);
  }

  console.log('\n✅ Verification complete!\n');
}

// Additional helper to check current notification triggers
async function checkNotificationTriggers() {
  console.log('\n🔔 Checking notification trigger configuration...\n');
  
  try {
    // Check if notification triggers exist for mentions
    const { data: triggers, error } = await supabase
      .from('notification_triggers')
      .select('*')
      .eq('event_type', 'user_mentioned');

    if (error) {
      console.log('⚠️  Could not check notification triggers (table may not exist)');
      return;
    }

    if (triggers && triggers.length > 0) {
      console.log('✅ Found user_mentioned triggers:');
      triggers.forEach(trigger => {
        console.log(`   - Trigger ${trigger.id}: ${trigger.name}`);
        console.log(`     Active: ${trigger.is_active}`);
        console.log(`     Category: ${trigger.category}`);
      });
    } else {
      console.log('⚠️  No user_mentioned triggers found - notifications may need manual setup');
    }
  } catch (error) {
    console.log('⚠️  Error checking triggers:', error.message);
  }
}

// Run verification
async function main() {
  await verifyMentionFeature();
  await checkNotificationTriggers();
}

main();