#!/usr/bin/env node

/**
 * Test script for mention functionality
 * Tests the @mention feature in the messaging system
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

async function testMentions() {
  try {
    console.log('🧪 Testing mention functionality...\n');

    // 1. Get test users
    console.log('1️⃣ Getting test users...');
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .limit(3);

    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }

    if (users.length < 2) {
      console.error('❌ Need at least 2 users to test mentions');
      return;
    }

    const sender = users[0];
    const mentioned = users[1];
    console.log(`✅ Sender: ${sender.first_name} ${sender.last_name} (${sender.email})`);
    console.log(`✅ To mention: ${mentioned.first_name} ${mentioned.last_name} (${mentioned.email})`);

    // 2. Get a test workspace
    console.log('\n2️⃣ Getting test workspace...');
    const { data: workspace, error: wsError } = await supabase
      .from('community_workspaces')
      .select('id, name')
      .limit(1)
      .single();

    if (wsError || !workspace) {
      console.error('❌ Error fetching workspace:', wsError);
      return;
    }
    console.log(`✅ Workspace: ${workspace.name}`);

    // 3. Get or create a test thread
    console.log('\n3️⃣ Getting test thread...');
    let { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .select('id, thread_title')
      .eq('workspace_id', workspace.id)
      .limit(1)
      .single();

    if (threadError || !thread) {
      console.log('Creating new thread...');
      const { data: newThread, error: createError } = await supabase
        .from('message_threads')
        .insert({
          workspace_id: workspace.id,
          thread_title: 'Test de Menciones',
          description: 'Hilo para probar las menciones',
          category: 'general',
          created_by: sender.id,
          is_pinned: false,
          is_locked: false,
          is_archived: false
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating thread:', createError);
        return;
      }
      thread = newThread;
    }
    console.log(`✅ Thread: ${thread.thread_title}`);

    // 4. Create a message with a mention
    console.log('\n4️⃣ Creating message with mention...');
    const messageContent = `Hola @${mentioned.first_name} ${mentioned.last_name}, esta es una prueba de mención`;
    
    const { data: message, error: msgError } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: workspace.id,
        thread_id: thread.id,
        author_id: sender.id,
        content: messageContent,
        mentions: [mentioned.id],
        message_type: 'regular',
        is_edited: false,
        is_deleted: false
      })
      .select()
      .single();

    if (msgError) {
      console.error('❌ Error creating message:', msgError);
      return;
    }
    console.log(`✅ Message created: ${message.id}`);

    // 5. Check if notification was created
    console.log('\n5️⃣ Checking for notification...');
    // Wait a moment for notification to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', mentioned.id)
      .eq('type', 'mention_in_message')
      .order('created_at', { ascending: false })
      .limit(1);

    if (notifError) {
      console.error('❌ Error checking notifications:', notifError);
      return;
    }

    if (notifications && notifications.length > 0) {
      console.log(`✅ Notification created for ${mentioned.first_name}!`);
      console.log(`   Title: ${notifications[0].title}`);
      console.log(`   Message: ${notifications[0].message}`);
    } else {
      console.log('⚠️  No notification found (may need to be created manually via the notification service)');
    }

    // 6. Test reply notification
    console.log('\n6️⃣ Testing reply notification...');
    const { data: reply, error: replyError } = await supabase
      .from('community_messages')
      .insert({
        workspace_id: workspace.id,
        thread_id: thread.id,
        author_id: mentioned.id,
        reply_to_id: message.id,
        content: 'Gracias por mencionarme!',
        message_type: 'regular',
        is_edited: false,
        is_deleted: false
      })
      .select()
      .single();

    if (replyError) {
      console.error('❌ Error creating reply:', replyError);
      return;
    }
    console.log(`✅ Reply created: ${reply.id}`);

    // Check for reply notification
    await new Promise(resolve => setTimeout(resolve, 1000));
    const { data: replyNotifs, error: replyNotifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', sender.id)
      .eq('type', 'reply_to_message')
      .order('created_at', { ascending: false })
      .limit(1);

    if (replyNotifError) {
      console.error('❌ Error checking reply notifications:', replyNotifError);
      return;
    }

    if (replyNotifs && replyNotifs.length > 0) {
      console.log(`✅ Reply notification created for ${sender.first_name}!`);
      console.log(`   Title: ${replyNotifs[0].title}`);
      console.log(`   Message: ${replyNotifs[0].message}`);
    } else {
      console.log('⚠️  No reply notification found (may need to be created manually via the notification service)');
    }

    console.log('\n✅ Mention functionality test completed!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testMentions();