import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotificationsPage() {
  console.log('🧪 Testing Notifications Page Data Flow\n');

  try {
    // 1. Find a test user
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .limit(5);

    if (userError) {
      console.error('❌ Error fetching users:', userError);
      return;
    }

    console.log('✅ Found users:', users.length);
    
    // 2. Test the notifications query for the first user
    if (users && users.length > 0) {
      const testUserId = users[0].id;
      console.log(`\n📧 Testing with user: ${users[0].email} (${users[0].id})`);

      // Simulate the query from notifications.tsx
      const { data: notifications, error: notifError } = await supabase
        .from('user_notifications')
        .select(`
          *,
          notification_type:notification_types!notification_type_id(
            id,
            name,
            category
          )
        `)
        .eq('user_id', testUserId)
        .order('created_at', { ascending: false });

      if (notifError) {
        console.error('❌ Error fetching notifications:', notifError);
        console.error('Query details:', {
          table: 'user_notifications',
          userId: testUserId,
          error: notifError.message
        });
      } else {
        console.log(`✅ Notifications query successful: ${notifications?.length || 0} notifications found`);
        
        // Check for any notifications with null notification_type
        const nullTypeCount = notifications?.filter(n => !n.notification_type).length || 0;
        if (nullTypeCount > 0) {
          console.warn(`⚠️  ${nullTypeCount} notifications have NULL notification_type`);
        }

        // Test the filter that was causing issues
        if (notifications && notifications.length > 0) {
          console.log('\n🔍 Testing category filter...');
          const categories = new Set(notifications.map(n => n.notification_type?.category).filter(Boolean));
          console.log('Available categories:', Array.from(categories));
          
          // Test the problematic filter
          const filtered = notifications.filter(n => n.notification_type?.category === 'assignments');
          console.log(`✅ Filter test passed: ${filtered.length} assignments found`);
        }
      }

      // 3. Test getUserPrimaryRole
      console.log('\n🔍 Testing getUserPrimaryRole...');
      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', testUserId)
        .eq('is_active', true);

      if (roleError) {
        console.error('❌ Error fetching user role:', roleError);
      } else {
        console.log(`✅ User role query successful: ${roles?.[0]?.role_type || 'No role found'}`);
      }
    }

    console.log('\n✨ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNotificationsPage();