const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function detailedNotificationReport() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`DETAILED NOTIFICATION REPORT`);
  console.log(`User ID: ${userId}`);
  console.log(`User: Brent Curtis (brent@perrotuertocm.cl)`);
  console.log('='.repeat(60));
  
  try {
    // Get ALL notifications for this user
    const { data: allNotifications, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`Total notifications: ${allNotifications.length}`);
    console.log(`Unread notifications: ${allNotifications.filter(n => !n.read_at).length}`);
    console.log(`Read notifications: ${allNotifications.filter(n => n.read_at).length}`);
    
    // Check for unread beyond position 10
    const unreadNotifications = allNotifications.filter(n => !n.read_at);
    const unreadBeyond10 = unreadNotifications.slice(10);
    
    console.log(`\n🔍 UNREAD NOTIFICATIONS ANALYSIS:`);
    console.log(`Total unread: ${unreadNotifications.length}`);
    console.log(`Unread in first 10: ${Math.min(unreadNotifications.length, 10)}`);
    console.log(`Unread beyond position 10: ${unreadBeyond10.length}`);
    
    if (unreadBeyond10.length > 0) {
      console.log(`\n⚠️  FOUND ${unreadBeyond10.length} UNREAD NOTIFICATIONS BEYOND THE FIRST 10!`);
      console.log(`These notifications might not be visible to the user in the UI:`);
      unreadBeyond10.forEach((notif, index) => {
        console.log(`  ${index + 1}. ID: ${notif.id}, Created: ${notif.created_at}`);
      });
    } else {
      console.log(`\n✅ NO UNREAD NOTIFICATIONS BEYOND THE FIRST 10`);
    }
    
    // Show all notifications with their positions
    console.log(`\n📋 ALL NOTIFICATIONS (showing first 15):`);
    allNotifications.slice(0, 15).forEach((notif, index) => {
        const readStatus = notif.read_at ? '✓ Read' : '○ Unread';
        console.log(`  ${index + 1}. ${readStatus} | Type: ${notif.type || 'undefined'} | Created: ${notif.created_at}`);
    });
    
    if (allNotifications.length > 15) {
      console.log(`  ... and ${allNotifications.length - 15} more notifications`);
    }
    
    // Check content of notifications
    console.log(`\n📝 NOTIFICATION CONTENT SAMPLE (first 3):`);
    allNotifications.slice(0, 3).forEach((notif, index) => {
      console.log(`\nNotification ${index + 1}:`);
      console.log(`  ID: ${notif.id}`);
      console.log(`  Type: ${notif.type || 'undefined'}`);
      console.log(`  Title: ${notif.title || 'No title'}`);
      console.log(`  Message: ${notif.message || 'No message'}`);
      console.log(`  Read at: ${notif.read_at || 'Not read'}`);
      console.log(`  Created: ${notif.created_at}`);
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

detailedNotificationReport();