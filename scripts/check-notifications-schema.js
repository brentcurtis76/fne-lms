const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNotificationSchema() {
  console.log('Checking user_notifications schema...\n');
  
  // Query 1: Check the exact schema of user_notifications table
  const { data: schema, error: schemaError } = await supabase
    .rpc('query_raw', {
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_notifications'
        ORDER BY ordinal_position;
      `
    });
  
  if (schemaError) {
    console.error('Error checking schema:', schemaError);
  } else {
    console.log('Table Schema:');
    console.table(schema);
  }
  
  // Query 2: Check if notification_type_id can be NULL
  const { data: nullability, error: nullError } = await supabase
    .rpc('query_raw', {
      query: `
        SELECT 
          a.attname as column_name,
          a.attnotnull as not_null
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        WHERE c.relname = 'user_notifications'
        AND a.attname = 'notification_type_id';
      `
    });
  
  if (nullError) {
    console.error('Error checking nullability:', nullError);
  } else {
    console.log('\nNotification Type ID Nullability:');
    console.table(nullability);
  }
  
  // Query 3: Check sample notifications with their types
  const { data: samples, error: samplesError } = await supabase
    .from('user_notifications')
    .select(`
      id,
      title,
      notification_type_id,
      notification_types (
        name,
        category
      )
    `)
    .limit(5);
  
  if (samplesError) {
    console.error('Error fetching samples:', samplesError);
  } else {
    console.log('\nSample Notifications:');
    console.table(samples);
  }
  
  // Query 4: Check if there are any notifications with NULL or invalid notification_type_id
  const { data: counts, error: countsError } = await supabase
    .rpc('query_raw', {
      query: `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN notification_type_id IS NULL THEN 1 ELSE 0 END) as null_type_count,
               SUM(CASE WHEN nt.id IS NULL AND un.notification_type_id IS NOT NULL THEN 1 ELSE 0 END) as invalid_type_count
        FROM user_notifications un
        LEFT JOIN notification_types nt ON un.notification_type_id = nt.id;
      `
    });
  
  if (countsError) {
    console.error('Error checking counts:', countsError);
  } else {
    console.log('\nNotification Type Statistics:');
    console.table(counts);
  }
}

checkNotificationSchema()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script error:', err);
    process.exit(1);
  });