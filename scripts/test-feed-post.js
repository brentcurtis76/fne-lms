/**
 * Test creating a post in the Instagram feed
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Use anon key to simulate frontend behavior
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFeedPost() {
  console.log('🧪 Testing Instagram feed post creation...\n');

  // First, check if we can read from posts_with_engagement
  console.log('1️⃣ Testing read from posts_with_engagement view:');
  const { data: posts, error: readError } = await supabase
    .from('posts_with_engagement')
    .select('*')
    .limit(1);

  if (readError) {
    console.log('  ❌ Read error:', readError.message);
    console.log('     This might be an RLS policy issue');
  } else {
    console.log('  ✅ Can read from view');
    console.log('  📊 Found', posts?.length || 0, 'posts');
  }

  // Check current user
  console.log('\n2️⃣ Checking authentication:');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.log('  ❌ Not authenticated. Please log in to test post creation.');
    return;
  }
  
  console.log('  ✅ Authenticated as:', user.email);
  console.log('  🆔 User ID:', user.id);

  // Try to get workspace ID
  console.log('\n3️⃣ Getting workspace ID:');
  const { data: workspaces, error: wsError } = await supabase
    .from('community_workspaces')
    .select('id, community:growth_communities(name)')
    .limit(1);

  if (wsError) {
    console.log('  ❌ Error getting workspace:', wsError.message);
    return;
  }

  if (!workspaces || workspaces.length === 0) {
    console.log('  ❌ No workspace found for user');
    return;
  }

  const workspace = workspaces[0];
  console.log('  ✅ Found workspace:', workspace.id);
  console.log('  📍 Community:', workspace.community?.name);

  // Try to create a test post
  console.log('\n4️⃣ Testing post creation:');
  const { data: newPost, error: createError } = await supabase
    .from('community_posts')
    .insert({
      workspace_id: workspace.id,
      author_id: user.id,
      type: 'text',
      content: { text: 'Test post from script' },
      visibility: 'community'
    })
    .select()
    .single();

  if (createError) {
    console.log('  ❌ Create error:', createError.message);
    console.log('     Error details:', createError);
    
    if (createError.message.includes('violates row-level security policy')) {
      console.log('\n  💡 This is an RLS policy issue. The policies might need adjustment.');
      console.log('     Make sure the user has the proper role in the community.');
    }
  } else {
    console.log('  ✅ Post created successfully!');
    console.log('  🆔 Post ID:', newPost.id);
    
    // Clean up - delete the test post
    await supabase
      .from('community_posts')
      .delete()
      .eq('id', newPost.id);
    console.log('  🧹 Test post cleaned up');
  }

  console.log('\n' + '='.repeat(50));
  console.log('Test complete!');
}

testFeedPost();