const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function countNotifications() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`Counting notifications for user: ${userId}`);
  console.log('='.repeat(60));
  
  try {
    // Get total count of all notifications
    const { count: totalCount, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (countError) {
      console.error('Error counting notifications:', countError);
      return;
    }
    
    console.log(`Total notifications: ${totalCount}`);
    
    // Get count of unread notifications
    const { count: unreadCount, error: unreadError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    
    if (unreadError) {
      console.error('Error counting unread notifications:', unreadError);
      return;
    }
    
    console.log(`Unread notifications: ${unreadCount}`);
    console.log(`Read notifications: ${totalCount - unreadCount}`);
    
    // Check if there are any unread notifications beyond the first 10
    const { data: unreadBeyond10, error: beyond10Error } = await supabase
      .from('notifications')
      .select('id, type, created_at')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .range(10, 1000); // Get unread notifications from position 11 onwards
    
    if (beyond10Error) {
      console.error('Error checking unread beyond 10:', beyond10Error);
      return;
    }
    
    console.log(`\nUnread notifications beyond the first 10: ${unreadBeyond10.length}`);
    
    if (unreadBeyond10.length > 0) {
      console.log('\nFirst 5 unread notifications beyond position 10:');
      unreadBeyond10.slice(0, 5).forEach((notif, index) => {
        console.log(`  ${index + 1}. Type: ${notif.type}, Created: ${notif.created_at}`);
      });
    }
    
    // Get breakdown by notification type
    const { data: typeBreakdown, error: typeError } = await supabase
      .from('notifications')
      .select('type')
      .eq('user_id', userId);
    
    if (typeError) {
      console.error('Error getting type breakdown:', typeError);
      return;
    }
    
    const typeCounts = typeBreakdown.reduce((acc, notif) => {
      acc[notif.type] = (acc[notif.type] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\nNotifications by type:');
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    
    // Get the 10 most recent notifications to compare with what user sees
    const { data: recent10, error: recentError } = await supabase
      .from('notifications')
      .select('id, type, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (recentError) {
      console.error('Error getting recent notifications:', recentError);
      return;
    }
    
    console.log('\n10 most recent notifications:');
    recent10.forEach((notif, index) => {
      console.log(`  ${index + 1}. Type: ${notif.type}, Read: ${notif.is_read}, Created: ${notif.created_at}`);
    });
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

countNotifications();