#!/usr/bin/env node

/**
 * Test thread creation directly
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

async function testThreadCreation() {
  try {
    console.log('🧪 Testing thread creation...\n');

    // 1. Get a workspace
    console.log('1️⃣ Getting workspace...');
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select('id, name, community_id')
      .limit(1);

    if (wsError || !workspaces || workspaces.length === 0) {
      console.error('❌ No workspace found:', wsError);
      return;
    }

    const workspace = workspaces[0];
    console.log(`✅ Using workspace: ${workspace.name} (${workspace.id})`);

    // 2. Get a user (you)
    console.log('\n2️⃣ Getting user...');
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'bcurtis@nuevaeducacion.org')
      .single();

    if (userError || !users) {
      console.error('❌ User not found:', userError);
      return;
    }

    console.log(`✅ Using user: ${users.first_name} ${users.last_name} (${users.email})`);

    // 3. Check if user has access to workspace
    console.log('\n3️⃣ Checking user access to workspace...');
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', users.id)
      .eq('community_id', workspace.community_id);

    if (roleError || !userRoles || userRoles.length === 0) {
      console.error('❌ User does not have access to this workspace:', roleError);
      return;
    }

    console.log(`✅ User has role: ${userRoles[0].role}`);

    // 4. Try to create a thread
    console.log('\n4️⃣ Creating test thread...');
    const threadData = {
      workspace_id: workspace.id,
      thread_title: 'Test Thread - Can Delete',
      description: 'Testing thread creation functionality',
      category: 'general',
      created_by: users.id,
      is_pinned: false,
      is_locked: false,
      is_archived: false,
      last_message_at: new Date().toISOString(),
      message_count: 0,
      participant_count: 1
    };

    console.log('Thread data:', JSON.stringify(threadData, null, 2));

    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert(threadData)
      .select()
      .single();

    if (threadError) {
      console.error('❌ Error creating thread:', threadError);
      console.error('Error details:', JSON.stringify(threadError, null, 2));
      
      // Check if it's an RLS issue
      if (threadError.code === '42501') {
        console.error('\n⚠️  This is a Row Level Security (RLS) policy issue.');
        console.error('The insert policy might be blocking the operation.');
      }
    } else {
      console.log('✅ Thread created successfully!');
      console.log(`   ID: ${thread.id}`);
      console.log(`   Title: ${thread.thread_title}`);
      
      // Clean up
      console.log('\n5️⃣ Cleaning up test thread...');
      const { error: deleteError } = await supabase
        .from('message_threads')
        .delete()
        .eq('id', thread.id);
        
      if (!deleteError) {
        console.log('✅ Test thread deleted');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testThreadCreation();