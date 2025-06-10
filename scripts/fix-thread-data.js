#!/usr/bin/env node

/**
 * Fix thread data inconsistencies
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

async function analyzeThreadData() {
  try {
    console.log('🔍 Analyzing thread data...\n');

    // 1. Get all threads
    console.log('1️⃣ Fetching threads...');
    const { data: threads, error: threadsError } = await supabase
      .from('message_threads')
      .select('*')
      .order('created_at', { ascending: false });

    if (threadsError) {
      console.error('❌ Error fetching threads:', threadsError);
      return;
    }

    console.log(`Found ${threads?.length || 0} threads\n`);

    // 2. For each thread, check the messages and creator
    for (const thread of threads || []) {
      console.log(`📌 Thread: "${thread.thread_title}"`);
      console.log(`   ID: ${thread.id}`);
      console.log(`   Created by: ${thread.created_by}`);
      console.log(`   Created at: ${new Date(thread.created_at).toLocaleString()}`);

      // Get creator info
      const { data: creator } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', thread.created_by)
        .single();

      if (creator) {
        console.log(`   Creator: ${creator.first_name} ${creator.last_name} (${creator.email})`);
      }

      // Get messages in this thread
      const { data: messages } = await supabase
        .from('community_messages')
        .select('id, author_id, content, created_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true });

      console.log(`   Messages: ${messages?.length || 0}`);

      // Get the first message author
      if (messages && messages.length > 0) {
        const firstMessage = messages[0];
        const { data: messageAuthor } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', firstMessage.author_id)
          .single();

        if (messageAuthor) {
          console.log(`   First message by: ${messageAuthor.first_name} ${messageAuthor.last_name} (${messageAuthor.email})`);
          
          // Check if thread creator and first message author are different
          if (thread.created_by !== firstMessage.author_id) {
            console.log(`   ⚠️  MISMATCH: Thread created by ${thread.created_by} but first message by ${firstMessage.author_id}`);
            
            // Option to fix
            console.log(`   To fix this, run: node scripts/fix-thread-data.js fix-creator ${thread.id} ${firstMessage.author_id}`);
          }
        }
      }
      console.log('');
    }

    // Handle command line arguments
    const action = process.argv[2];
    const threadId = process.argv[3];
    const newCreatorId = process.argv[4];

    if (action === 'fix-creator' && threadId && newCreatorId) {
      console.log(`\n🔧 Fixing thread creator...`);
      console.log(`   Thread ID: ${threadId}`);
      console.log(`   New creator ID: ${newCreatorId}`);

      const { error: updateError } = await supabase
        .from('message_threads')
        .update({ created_by: newCreatorId })
        .eq('id', threadId);

      if (updateError) {
        console.error('❌ Error updating thread:', updateError);
      } else {
        console.log('✅ Thread creator updated successfully');
      }
    }

    // Option to fix all mismatches
    if (action === 'fix-all-creators') {
      console.log('\n🔧 Fixing all thread creators to match first message author...');
      
      let fixed = 0;
      for (const thread of threads || []) {
        const { data: messages } = await supabase
          .from('community_messages')
          .select('author_id')
          .eq('thread_id', thread.id)
          .order('created_at', { ascending: true })
          .limit(1);

        if (messages && messages.length > 0 && messages[0].author_id !== thread.created_by) {
          const { error: updateError } = await supabase
            .from('message_threads')
            .update({ created_by: messages[0].author_id })
            .eq('id', thread.id);

          if (!updateError) {
            fixed++;
            console.log(`   ✅ Fixed thread: ${thread.thread_title}`);
          }
        }
      }
      console.log(`\n✅ Fixed ${fixed} threads`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the analysis
analyzeThreadData();