#!/usr/bin/env node

/**
 * Test thread creation with different categories
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

async function testCategories() {
  try {
    console.log('🧪 Testing thread categories...\n');

    // 1. Check current enum values
    console.log('1️⃣ Checking current thread_category enum values...');
    const { data: enumValues, error: enumError } = await supabase
      .rpc('enum_range', { enum_type: null })
      .eq('enum_type', 'thread_category');

    if (enumError) {
      console.log('Could not fetch enum values directly, trying alternative method...');
      
      // Try a different approach
      const { data: testData, error: testError } = await supabase
        .from('message_threads')
        .select('category')
        .limit(1);
      
      console.log('Sample query result:', testData, testError);
    } else {
      console.log('Current enum values:', enumValues);
    }

    // 2. Get a workspace and user for testing
    const { data: workspaces } = await supabase
      .from('community_workspaces')
      .select('id, name')
      .limit(1);

    const { data: users } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'bcurtis@nuevaeducacion.org')
      .single();

    if (!workspaces || workspaces.length === 0 || !users) {
      console.error('❌ No workspace or user found for testing');
      return;
    }

    const workspace = workspaces[0];
    const user = users;

    console.log(`\n2️⃣ Testing with workspace: ${workspace.name} and user: ${user.email}\n`);

    // 3. Test each category
    const testCategories = [
      { value: 'general', expected: 'should work (existing)' },
      { value: 'ideas', expected: 'should work after fix' },
      { value: 'tasks', expected: 'should work after fix' },
      { value: 'questions', expected: 'should work after fix' }
    ];

    for (const category of testCategories) {
      console.log(`3️⃣ Testing category: "${category.value}" (${category.expected})`);
      
      const threadData = {
        workspace_id: workspace.id,
        thread_title: `Test ${category.value} - ${new Date().toISOString()}`,
        description: `Testing ${category.value} category`,
        category: category.value,
        created_by: user.id,
        is_pinned: false,
        is_locked: false,
        is_archived: false,
        last_message_at: new Date().toISOString(),
        message_count: 0,
        participant_count: 1
      };

      const { data: thread, error: threadError } = await supabase
        .from('message_threads')
        .insert(threadData)
        .select()
        .single();

      if (threadError) {
        console.error(`   ❌ Failed: ${threadError.message}`);
        if (threadError.code === '22P02') {
          console.error('   ⚠️  This is the enum constraint error. Run the SQL fix first!');
        }
      } else {
        console.log(`   ✅ Success! Thread created with ID: ${thread.id}`);
        
        // Clean up
        await supabase
          .from('message_threads')
          .delete()
          .eq('id', thread.id);
        console.log('   🧹 Test thread cleaned up');
      }
      console.log('');
    }

    console.log('\n📋 Summary:');
    console.log('If you see enum constraint errors above, run this SQL in Supabase:');
    console.log('```sql');
    console.log("ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'ideas';");
    console.log("ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'tasks';");
    console.log("ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'questions';");
    console.log('```');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testCategories();