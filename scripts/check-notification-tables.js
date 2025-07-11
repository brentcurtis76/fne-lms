const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkNotificationTables() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`Checking notification-related tables for user: ${userId}`);
  console.log('='.repeat(60));
  
  try {
    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userId)
      .single();
    
    if (userError) {
      console.error('Error finding user:', userError);
    } else {
      console.log(`User found: ${user.email} (${user.first_name} ${user.last_name})`);
    }
    
    // Check 'notifications' table
    console.log('\nChecking "notifications" table:');
    const { count: notifCount, error: notifError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (notifError) {
      console.error('Error with notifications table:', notifError);
    } else {
      console.log(`  Count in notifications table: ${notifCount}`);
    }
    
    // Check 'user_notifications' table (might be a different table name)
    console.log('\nChecking "user_notifications" table:');
    const { count: userNotifCount, error: userNotifError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (userNotifError) {
      console.error('Error with user_notifications table:', userNotifError);
    } else {
      console.log(`  Count in user_notifications table: ${userNotifCount}`);
      
      // If there are notifications in user_notifications, get details
      if (userNotifCount > 0) {
        const { data: userNotifs, error: detailError } = await supabase
          .from('user_notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        
        if (!detailError) {
          console.log(`\n  Total notifications: ${userNotifs.length}`);
          console.log(`  Unread notifications: ${userNotifs.filter(n => !n.read_at).length}`);
          console.log(`  Read notifications: ${userNotifs.filter(n => n.read_at).length}`);
          
          const unreadBeyond10 = userNotifs.filter(n => !n.read_at).slice(10);
          console.log(`  Unread notifications beyond the first 10: ${unreadBeyond10.length}`);
          
          // Show type breakdown
          const typeCounts = userNotifs.reduce((acc, notif) => {
            acc[notif.type] = (acc[notif.type] || 0) + 1;
            return acc;
          }, {});
          
          console.log('\n  Notifications by type:');
          Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            console.log(`    ${type}: ${count}`);
          });
          
          // Show recent 10
          console.log('\n  10 most recent notifications:');
          userNotifs.slice(0, 10).forEach((notif, index) => {
            console.log(`    ${index + 1}. Type: ${notif.type}, Read: ${!!notif.read_at}, Created: ${notif.created_at}`);
          });
        }
      }
    }
    
    // Check any sample notifications from any user
    console.log('\nChecking for any notifications in the system:');
    const { data: anyNotifs, error: anyError } = await supabase
      .from('notifications')
      .select('user_id')
      .limit(5);
    
    if (anyError) {
      console.error('Error checking any notifications:', anyError);
    } else {
      console.log(`  Found ${anyNotifs.length} notifications in notifications table`);
    }
    
    const { data: anyUserNotifs, error: anyUserError } = await supabase
      .from('user_notifications')
      .select('user_id')
      .limit(5);
    
    if (anyUserError) {
      console.error('Error checking any user_notifications:', anyUserError);
    } else {
      console.log(`  Found ${anyUserNotifs.length} notifications in user_notifications table`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkNotificationTables();