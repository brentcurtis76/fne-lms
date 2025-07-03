const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testNotificationTables() {
  console.log('Testing notification tables...\n');
  
  try {
    // 1. Check if notification_types table exists
    console.log('1. Checking notification_types table:');
    const { data: types, error: typesError } = await supabase
      .from('notification_types')
      .select('*')
      .limit(5);
    
    if (typesError) {
      console.error('   ❌ Error accessing notification_types:', typesError.message);
    } else {
      console.log('   ✅ notification_types table exists');
      console.log('   Sample data:', types);
    }
    
    // 2. Check if user_notifications table exists
    console.log('\n2. Checking user_notifications table:');
    const { data: notifications, error: notifError } = await supabase
      .from('user_notifications')
      .select('*')
      .limit(5);
    
    if (notifError) {
      console.error('   ❌ Error accessing user_notifications:', notifError.message);
    } else {
      console.log('   ✅ user_notifications table exists');
      console.log('   Row count:', notifications?.length || 0);
    }
    
    // 3. Test the join
    console.log('\n3. Testing join between tables:');
    const { data: joined, error: joinError } = await supabase
      .from('user_notifications')
      .select(`
        id,
        title,
        notification_type:notification_types!notification_type_id(
          id,
          name,
          category
        )
      `)
      .limit(5);
    
    if (joinError) {
      console.error('   ❌ Error with join:', joinError.message);
    } else {
      console.log('   ✅ Join successful');
      console.log('   Sample joined data:', JSON.stringify(joined, null, 2));
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testNotificationTables();