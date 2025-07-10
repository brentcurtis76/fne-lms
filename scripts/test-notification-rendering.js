import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNotificationRendering() {
  console.log('🧪 Testing Notification Page Rendering Logic\n');

  try {
    // Find a user with notifications
    const { data: usersWithNotifs } = await supabase
      .from('user_notifications')
      .select('user_id')
      .limit(1);

    if (!usersWithNotifs || usersWithNotifs.length === 0) {
      console.log('No users with notifications found. Creating test notification...');
      
      // Get any user
      const { data: anyUser } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .single();

      if (anyUser) {
        // Create a test notification
        const { error: createError } = await supabase
          .from('user_notifications')
          .insert({
            user_id: anyUser.id,
            title: 'Test Notification',
            description: 'This is a test notification to verify the page works',
            notification_type_id: null, // Test with null type
            is_read: false
          });

        if (createError) {
          console.error('Failed to create test notification:', createError);
        } else {
          console.log('✅ Created test notification');
        }
      }
    }

    // Test the exact query from notifications page
    const testUserId = usersWithNotifs?.[0]?.user_id || '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
    
    const { data: notifications, error } = await supabase
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

    if (error) {
      console.error('❌ Query failed:', error);
      return;
    }

    console.log(`✅ Found ${notifications?.length || 0} notifications\n`);

    // Simulate the filtering logic
    console.log('📋 Testing Filter Logic:');
    
    // Test search filter
    const searchTerm = 'tarea';
    const searchFiltered = notifications?.filter(n =>
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    console.log(`  Search for "${searchTerm}": ${searchFiltered?.length || 0} results`);

    // Test category filter (the problematic one)
    const categoryFilter = 'assignments';
    console.log(`\n  Testing category filter for "${categoryFilter}":`);
    const categoryFiltered = notifications?.filter(n => {
      const hasCategory = n.notification_type?.category === categoryFilter;
      console.log(`    - ${n.title}: category=${n.notification_type?.category || 'NULL'} match=${hasCategory}`);
      return hasCategory;
    });
    console.log(`  Category filter result: ${categoryFiltered?.length || 0} notifications`);

    // Test the rendering data
    console.log('\n🎨 Testing Render Data:');
    notifications?.slice(0, 3).forEach(n => {
      console.log(`\n  Notification: ${n.title}`);
      console.log(`    - ID: ${n.id}`);
      console.log(`    - Type: ${n.notification_type?.name || 'NO TYPE'}`);
      console.log(`    - Category: ${n.notification_type?.category || 'NO CATEGORY'}`);
      console.log(`    - Read: ${n.is_read}`);
      console.log(`    - URL: ${n.related_url || 'none'}`);
    });

    console.log('\n✅ All rendering tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNotificationRendering();