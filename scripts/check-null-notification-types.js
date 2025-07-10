const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNullNotificationTypes() {
  console.log('Checking for NULL notification_type_id values...\n');
  
  // Get all notifications with NULL notification_type_id
  const { data: nullNotifications, error: nullError } = await supabase
    .from('user_notifications')
    .select('id, title, message, user_id, notification_type_id')
    .is('notification_type_id', null);
  
  if (nullError) {
    console.error('Error fetching null notifications:', nullError);
  } else {
    console.log(`Found ${nullNotifications.length} notifications with NULL notification_type_id`);
    if (nullNotifications.length > 0) {
      console.log('\nSample notifications with NULL type:');
      console.table(nullNotifications.slice(0, 5));
    }
  }
  
  // Get all unique notification_type_id values
  const { data: allNotifications, error: allError } = await supabase
    .from('user_notifications')
    .select('notification_type_id');
  
  if (allError) {
    console.error('Error fetching all notifications:', allError);
  } else {
    const typeCounts = {};
    allNotifications.forEach(n => {
      const typeId = n.notification_type_id || 'NULL';
      typeCounts[typeId] = (typeCounts[typeId] || 0) + 1;
    });
    
    console.log('\nNotification type distribution:');
    console.table(typeCounts);
  }
  
  // Check if we have any invalid notification_type_id values
  const { data: invalidTypes, error: invalidError } = await supabase
    .from('user_notifications')
    .select(`
      id,
      title,
      notification_type_id,
      notification_types!left (
        id,
        name
      )
    `)
    .not('notification_type_id', 'is', null)
    .is('notification_types.id', null);
  
  if (invalidError) {
    console.error('Error checking invalid types:', invalidError);
  } else {
    console.log(`\nFound ${invalidTypes.length} notifications with invalid notification_type_id`);
    if (invalidTypes.length > 0) {
      console.log('Sample invalid notifications:');
      console.table(invalidTypes.slice(0, 5));
    }
  }
  
  // Get all valid notification types
  const { data: validTypes, error: typesError } = await supabase
    .from('notification_types')
    .select('id, name, category')
    .order('category');
  
  if (typesError) {
    console.error('Error fetching notification types:', typesError);
  } else {
    console.log('\nAvailable notification types:');
    console.table(validTypes);
  }
}

checkNullNotificationTypes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script error:', err);
    process.exit(1);
  });