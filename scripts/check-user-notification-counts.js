const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserNotificationCounts() {
  console.log('\n🔍 CHECKING USER NOTIFICATION COUNTS\n');
  
  try {
    // Get all notifications to analyze
    const { data: allNotifs, error: allError } = await supabase
      .from('user_notifications')
      .select('user_id, is_read')
      .order('created_at', { ascending: false });
      
    if (allError) {
      console.error('Error fetching notifications:', allError);
      return;
    }
    
    // Count total and unread notifications per user
    const userStats = {};
    allNotifs.forEach(record => {
      const userId = record.user_id;
      if (!userStats[userId]) {
        userStats[userId] = { total: 0, unread: 0 };
      }
      userStats[userId].total++;
      if (!record.is_read) {
        userStats[userId].unread++;
      }
    });
    
    // Sort users by total notification count
    const sortedUsers = Object.entries(userStats)
      .sort(([,a], [,b]) => b.total - a.total);
      
    console.log('TOP USERS BY NOTIFICATION COUNT:');
    console.log('='.repeat(50));
    console.log('User ID                                  Total  Unread');
    console.log('-'.repeat(50));
    
    sortedUsers.slice(0, 10).forEach(([userId, stats]) => {
      console.log(`${userId}  ${stats.total.toString().padStart(5)}  ${stats.unread.toString().padStart(6)}`);
    });
    
    // Check for users with high unread counts
    const highUnreadUsers = sortedUsers
      .filter(([_, stats]) => stats.unread > 5)
      .slice(0, 5);
      
    if (highUnreadUsers.length > 0) {
      console.log('\n\n⚠️  USERS WITH HIGH UNREAD COUNTS:');
      console.log('='.repeat(50));
      
      for (const [userId, stats] of highUnreadUsers) {
        console.log(`\nUser ${userId.substring(0, 8)}...: ${stats.unread} unread (${stats.total} total)`);
        
        // Get this user's recent unread notifications
        const { data: userNotifs } = await supabase
          .from('user_notifications')
          .select('*')
          .eq('user_id', userId)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(5);
          
        if (userNotifs) {
          console.log('  Recent unread notifications:');
          userNotifs.forEach((n, idx) => {
            console.log(`    ${idx + 1}. ${n.title}`);
            console.log(`       Created: ${n.created_at}`);
            console.log(`       Category: ${n.category}`);
          });
        }
      }
    }
    
    // Summary statistics
    console.log('\n\n📊 SUMMARY STATISTICS:');
    console.log('='.repeat(50));
    console.log(`Total users with notifications: ${sortedUsers.length}`);
    console.log(`Total notifications: ${allNotifs.length}`);
    console.log(`Average notifications per user: ${(allNotifs.length / sortedUsers.length).toFixed(1)}`);
    
    const totalUnread = Object.values(userStats).reduce((sum, stats) => sum + stats.unread, 0);
    console.log(`Total unread notifications: ${totalUnread}`);
    console.log(`Average unread per user: ${(totalUnread / sortedUsers.length).toFixed(1)}`);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function main() {
  await checkUserNotificationCounts();
}

main();