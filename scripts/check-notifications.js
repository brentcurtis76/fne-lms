const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBrentNotifications() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  // Get 10 most recent notifications
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching notifications:', error);
    return;
  }

  console.log('\n=== Brent\'s 10 Most Recent Notifications ===\n');
  
  notifications.forEach((notif, index) => {
    console.log(`${index + 1}. Notification ID: ${notif.id}`);
    console.log(`   Type: ${notif.type}`);
    console.log(`   Title: ${notif.title}`);
    console.log(`   Message: ${notif.message}`);
    console.log(`   Is Read: ${notif.is_read}`);
    console.log(`   Created: ${new Date(notif.created_at).toLocaleString()}`);
    console.log(`   ---`);
  });

  // Count unread notifications
  const { count, error: countError } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (countError) {
    console.error('Error counting unread notifications:', countError);
    return;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total unread notifications: ${count}`);
  console.log(`Unread in recent 10: ${notifications.filter(n => n.is_read === false).length}`);
}

checkBrentNotifications().catch(console.error);