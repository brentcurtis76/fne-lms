#!/usr/bin/env node

/**
 * Check messaging tables and debug thread creation
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

async function checkMessagingTables() {
  try {
    console.log('🔍 Checking messaging tables...\n');

    // 1. Check if tables exist
    console.log('1️⃣ Checking table existence...');
    const tables = ['message_threads', 'community_messages', 'message_reactions', 'message_attachments', 'thread_participants'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      if (error?.code === '42P01') {
        console.log(`❌ Table ${table} does not exist`);
      } else if (error) {
        console.log(`⚠️  Table ${table} exists but has error:`, error.message);
      } else {
        console.log(`✅ Table ${table} exists`);
      }
    }

    // 2. Check community_workspaces
    console.log('\n2️⃣ Checking community workspaces...');
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select('id, name, community_id')
      .limit(5);

    if (wsError) {
      console.error('❌ Error fetching workspaces:', wsError);
    } else {
      console.log(`✅ Found ${workspaces?.length || 0} workspaces`);
      workspaces?.forEach(ws => {
        console.log(`   - ${ws.name} (${ws.id})`);
      });
    }

    // 3. Test thread creation
    if (workspaces && workspaces.length > 0) {
      console.log('\n3️⃣ Testing thread creation...');
      
      // Get a test user
      const { data: users } = await supabase
        .from('profiles')
        .select('id, email')
        .limit(1);

      if (users && users.length > 0) {
        const testUser = users[0];
        const testWorkspace = workspaces[0];
        
        console.log(`   Using user: ${testUser.email}`);
        console.log(`   Using workspace: ${testWorkspace.name}`);

        const { data: thread, error: threadError } = await supabase
          .from('message_threads')
          .insert({
            workspace_id: testWorkspace.id,
            thread_title: 'Test Thread - Debug',
            description: 'Testing thread creation',
            category: 'general',
            created_by: testUser.id,
            is_pinned: false,
            is_locked: false,
            is_archived: false
          })
          .select()
          .single();

        if (threadError) {
          console.error('❌ Error creating thread:', threadError);
          console.error('   Details:', JSON.stringify(threadError, null, 2));
        } else {
          console.log('✅ Thread created successfully:', thread.id);
          
          // Clean up test thread
          await supabase
            .from('message_threads')
            .delete()
            .eq('id', thread.id);
          console.log('   (Test thread deleted)');
        }
      }
    }

    // 4. Check existing threads
    console.log('\n4️⃣ Checking existing threads...');
    const { data: threads, error: threadsError } = await supabase
      .from('message_threads')
      .select('id, thread_title, workspace_id, created_at')
      .limit(5)
      .order('created_at', { ascending: false });

    if (threadsError) {
      console.error('❌ Error fetching threads:', threadsError);
    } else {
      console.log(`✅ Found ${threads?.length || 0} threads`);
      threads?.forEach(t => {
        console.log(`   - ${t.thread_title} (created: ${new Date(t.created_at).toLocaleDateString()})`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkMessagingTables();