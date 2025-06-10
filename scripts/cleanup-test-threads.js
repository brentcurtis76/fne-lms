#!/usr/bin/env node

/**
 * Cleanup test threads and messages
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

async function cleanupTestData() {
  try {
    console.log('🧹 Cleaning up test data...\n');

    // 1. Find test users
    console.log('1️⃣ Looking for test users...');
    const { data: testUsers, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .or('email.ilike.%example%,email.ilike.%test%')
      .order('created_at', { ascending: false });

    if (userError) {
      console.error('❌ Error fetching users:', userError);
    } else {
      console.log(`Found ${testUsers?.length || 0} test users:`);
      testUsers?.forEach(user => {
        console.log(`   - ${user.first_name} ${user.last_name} (${user.email})`);
      });
    }

    // 2. List all threads
    console.log('\n2️⃣ Current threads:');
    const { data: threads, error: threadsError } = await supabase
      .from('message_threads')
      .select('id, thread_title, created_by, created_at')
      .order('created_at', { ascending: false });

    if (threadsError) {
      console.error('❌ Error fetching threads:', threadsError);
    } else {
      console.log(`Found ${threads?.length || 0} threads:`);
      for (const thread of threads || []) {
        // Get creator info
        const { data: creator } = await supabase
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', thread.created_by)
          .single();
        
        const creatorName = creator ? `${creator.first_name} ${creator.last_name} (${creator.email})` : 'Unknown';
        console.log(`   - "${thread.thread_title}" by ${creatorName}`);
        console.log(`     ID: ${thread.id}`);
        console.log(`     Created: ${new Date(thread.created_at).toLocaleString()}`);
      }
    }

    // 3. Ask user what to do
    console.log('\n3️⃣ Options:');
    console.log('   To delete specific threads, run:');
    console.log('   node scripts/cleanup-test-threads.js delete <thread_id>');
    console.log('');
    console.log('   To delete ALL threads (careful!), run:');
    console.log('   node scripts/cleanup-test-threads.js delete-all');

    // Handle command line arguments
    const action = process.argv[2];
    const threadId = process.argv[3];

    if (action === 'delete' && threadId) {
      console.log(`\n🗑️  Deleting thread ${threadId}...`);
      
      // Delete messages first
      const { error: msgError } = await supabase
        .from('community_messages')
        .delete()
        .eq('thread_id', threadId);
      
      if (msgError) {
        console.error('❌ Error deleting messages:', msgError);
        return;
      }
      
      // Delete thread
      const { error: threadError } = await supabase
        .from('message_threads')
        .delete()
        .eq('id', threadId);
      
      if (threadError) {
        console.error('❌ Error deleting thread:', threadError);
      } else {
        console.log('✅ Thread deleted successfully');
      }
    } else if (action === 'delete-all') {
      console.log('\n⚠️  WARNING: This will delete ALL threads and messages!');
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Delete all messages
      const { error: msgError } = await supabase
        .from('community_messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (msgError) {
        console.error('❌ Error deleting messages:', msgError);
        return;
      }
      
      // Delete all threads
      const { error: threadError } = await supabase
        .from('message_threads')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (threadError) {
        console.error('❌ Error deleting threads:', threadError);
      } else {
        console.log('✅ All threads and messages deleted');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the cleanup
cleanupTestData();