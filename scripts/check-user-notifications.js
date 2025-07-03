const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserNotifications() {
  console.log('Checking user notifications...\n');
  
  try {
    // 1. Get all unique user_ids that have notifications
    console.log('1. Users with notifications:');
    const { data: userIds, error: userError } = await supabase
      .from('user_notifications')
      .select('user_id')
      .limit(20);
    
    if (userError) {
      console.error('   ❌ Error:', userError.message);
      return;
    }
    
    const uniqueUsers = [...new Set(userIds.map(n => n.user_id))];
    console.log('   Unique users with notifications:', uniqueUsers.length);
    console.log('   User IDs:', uniqueUsers.slice(0, 5));
    
    // 2. Get profile info for these users
    console.log('\n2. User profiles:');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in('id', uniqueUsers.slice(0, 5));
    
    if (profileError) {
      console.error('   ❌ Error:', profileError.message);
    } else {
      console.log('   Sample users with notifications:');
      profiles.forEach(p => {
        console.log(`   - ${p.email} (${p.first_name} ${p.last_name}) - ID: ${p.id}`);
      });
    }
    
    // 3. Check notification count by user
    console.log('\n3. Notification counts by user:');
    for (const userId of uniqueUsers.slice(0, 3)) {
      const { count, error } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      if (!error) {
        console.log(`   User ${userId}: ${count} notifications`);
      }
    }
    
    // 4. Get the admin user (brentcurtis76@gmail.com)
    console.log('\n4. Checking admin user (brentcurtis76@gmail.com):');
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', 'brentcurtis76@gmail.com')
      .single();
    
    if (adminError) {
      console.error('   ❌ Error finding admin:', adminError.message);
    } else {
      console.log('   Admin ID:', adminProfile.id);
      
      // Check notifications for admin
      const { data: adminNotifs, count: adminCount, error: notifError } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', adminProfile.id)
        .limit(5);
      
      if (!notifError) {
        console.log(`   Admin has ${adminCount} notifications`);
        if (adminNotifs && adminNotifs.length > 0) {
          console.log('   Sample notifications:', adminNotifs.map(n => n.title));
        }
      }
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkUserNotifications();