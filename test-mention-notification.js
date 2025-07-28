/**
 * Test script to verify mention notification creation
 * Run this after creating a post with mentions to check if notifications were created
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMentionNotifications() {
  console.log('🔍 Checking mention notifications...');
  
  try {
    // Check recent posts with mentions
    console.log('\n1. Checking recent posts...');
    const { data: posts, error: postsError } = await supabase
      .from('community_posts')
      .select('id, content, author_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (postsError) {
      console.error('❌ Error fetching posts:', postsError);
      return;
    }
    
    console.log(`✅ Found ${posts?.length || 0} recent posts`);
    posts?.forEach(post => {
      console.log(`   Post ${post.id}: "${post.content?.text?.substring(0, 50)}..." by ${post.author_id}`);
    });
    
    // Check post mentions
    console.log('\n2. Checking post mentions...');
    const { data: mentions, error: mentionsError } = await supabase
      .from('post_mentions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (mentionsError) {
      console.error('❌ Error fetching mentions:', mentionsError);
      return;
    }
    
    console.log(`✅ Found ${mentions?.length || 0} recent mentions`);
    mentions?.forEach(mention => {
      console.log(`   Mention: Post ${mention.post_id} -> User ${mention.mentioned_user_id}`);
    });
    
    // Check user notifications related to mentions
    console.log('\n3. Checking user notifications...');
    const { data: notifications, error: notificationsError } = await supabase
      .from('user_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (notificationsError) {
      console.error('❌ Error fetching notifications:', notificationsError);
      return;
    }
    
    console.log(`✅ Found ${notifications?.length || 0} recent notifications`);
    notifications?.forEach(notification => {
      console.log(`   Notification: "${notification.title}" for user ${notification.user_id} (read: ${notification.is_read})`);
    });
    
    // Check user mentions table
    console.log('\n4. Checking user mentions...');
    const { data: userMentions, error: userMentionsError } = await supabase
      .from('user_mentions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (userMentionsError) {
      console.error('❌ Error fetching user mentions:', userMentionsError);
      return;
    }
    
    console.log(`✅ Found ${userMentions?.length || 0} recent user mentions`);
    userMentions?.forEach(mention => {
      console.log(`   User Mention: ${mention.author_id} -> ${mention.mentioned_user_id} (context: ${mention.context})`);
    });
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   Posts: ${posts?.length || 0}`);
    console.log(`   Post Mentions: ${mentions?.length || 0}`);
    console.log(`   User Notifications: ${notifications?.length || 0}`);
    console.log(`   User Mentions: ${userMentions?.length || 0}`);
    
    if (mentions?.length > 0 && notifications?.length === 0) {
      console.log('\n❌ BUG DETECTED: Post mentions exist but no notifications were created!');
    } else if (mentions?.length > 0 && notifications?.length > 0) {
      console.log('\n✅ SUCCESS: Both mentions and notifications exist!');
    } else {
      console.log('\n⚠️  No recent mentions found to verify notification creation');
    }
    
  } catch (error) {
    console.error('❌ Error in check:', error);
  }
}

// Run the check
checkMentionNotifications();