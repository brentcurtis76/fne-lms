const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNotificationTables() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  // Check notifications table
  console.log('\n=== Checking "notifications" table ===');
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (notifError) {
    console.log('Error with notifications table:', notifError.message);
  } else {
    console.log(`Found ${notifications?.length || 0} notifications`);
  }

  // Check user_notifications table
  console.log('\n=== Checking "user_notifications" table ===');
  const { data: userNotifications, error: userNotifError } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (userNotifError) {
    console.log('Error with user_notifications table:', userNotifError.message);
  } else {
    console.log(`Found ${userNotifications?.length || 0} user_notifications`);
    
    if (userNotifications && userNotifications.length > 0) {
      console.log('\n=== User Notifications Details ===\n');
      userNotifications.forEach((notif, index) => {
        console.log(`${index + 1}. Notification ID: ${notif.id}`);
        console.log(`   Type: ${notif.type}`);
        console.log(`   Title: ${notif.title}`);
        console.log(`   Message: ${notif.message}`);
        console.log(`   Read At: ${notif.read_at || 'NOT READ'}`);
        console.log(`   Is Read: ${notif.read_at ? 'true' : 'false'}`);
        console.log(`   Created: ${new Date(notif.created_at).toLocaleString()}`);
        console.log(`   ---`);
      });
      
      // Count unread
      const unreadCount = userNotifications.filter(n => !n.read_at).length;
      console.log(`\n=== Summary ===`);
      console.log(`Unread in recent 10: ${unreadCount}`);
      
      // Get total unread count
      const { count, error: countError } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);

      if (!countError) {
        console.log(`Total unread notifications: ${count}`);
      }
    }
  }
}

checkNotificationTables().catch(console.error);