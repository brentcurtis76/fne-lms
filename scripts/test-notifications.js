const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotifications() {
  console.log('🧪 Testing notification system...\n');
  
  try {
    // Test user (Jorge from Los Pellines)
    const testUserId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
    
    // 1. Create a test notification
    console.log('1️⃣ Creating test notification...');
    const { data: newNotif, error: createError } = await supabase
      .from('user_notifications')
      .insert({
        user_id: testUserId,
        notification_type_id: 'system_update',
        title: 'Test Notification - Sistema Actualizado',
        description: 'Esta es una notificación de prueba para verificar el sistema',
        is_read: false,
        related_url: '/dashboard'
      })
      .select()
      .single();
    
    if (createError) {
      console.error('Error creating test notification:', createError);
      return;
    }
    
    console.log('✅ Test notification created:', newNotif.id);
    
    // 2. Fetch notifications (simulating what ModernNotificationCenter does)
    console.log('\n2️⃣ Fetching notifications (direct query)...');
    const { data: directNotifs, error: directError } = await supabase
      .from('user_notifications')
      .select(`
        id,
        title,
        description,
        is_read,
        related_url,
        created_at,
        notification_type_id
      `)
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (directError) {
      console.error('Error fetching notifications directly:', directError);
    } else {
      console.log(`✅ Found ${directNotifs.length} notifications (direct query)`);
      if (directNotifs.length > 0) {
        console.log('Latest notification:', {
          title: directNotifs[0].title,
          type_id: directNotifs[0].notification_type_id,
          is_read: directNotifs[0].is_read
        });
      }
    }
    
    // 3. Fetch with notification types join (simulating API)
    console.log('\n3️⃣ Fetching notifications with types (API simulation)...');
    const { data: joinedNotifs, error: joinError } = await supabase
      .from('user_notifications')
      .select(`
        id,
        title,
        notification_type_id,
        notification_types!left (
          id,
          name,
          category
        )
      `)
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (joinError) {
      console.error('Error fetching notifications with join:', joinError);
    } else {
      console.log(`✅ Found ${joinedNotifs.length} notifications (with type join)`);
      if (joinedNotifs.length > 0) {
        console.log('Latest notification with type:', {
          title: joinedNotifs[0].title,
          type_id: joinedNotifs[0].notification_type_id,
          type_name: joinedNotifs[0].notification_types?.name || 'No type info',
          category: joinedNotifs[0].notification_types?.category || 'No category'
        });
      }
    }
    
    // 4. Count unread notifications
    console.log('\n4️⃣ Counting unread notifications...');
    const { count: unreadCount, error: countError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testUserId)
      .eq('is_read', false);
    
    if (countError) {
      console.error('Error counting unread notifications:', countError);
    } else {
      console.log(`✅ Unread notifications: ${unreadCount}`);
    }
    
    // 5. Cleanup - delete test notification
    console.log('\n5️⃣ Cleaning up test notification...');
    const { error: deleteError } = await supabase
      .from('user_notifications')
      .delete()
      .eq('id', newNotif.id);
    
    if (deleteError) {
      console.error('Error deleting test notification:', deleteError);
    } else {
      console.log('✅ Test notification deleted');
    }
    
    console.log('\n✅ Notification system test completed successfully!');
    
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
}

testNotifications()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script error:', err);
    process.exit(1);
  });