/**
 * Inspect role_permissions table structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectTable() {
  console.log('🔍 Inspecting role_permissions table...\n');

  // Try to get schema information
  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Table exists and is accessible');
  console.log('\n📊 Sample data structure:', JSON.stringify(data, null, 2));

  // Try a simple insert to see what columns are expected
  console.log('\n🧪 Testing insert with minimal data...');

  const testRecord = {
    role_type: 'test_role',
    permission_key: 'test_permission'
  };

  const { data: inserted, error: insertError } = await supabase
    .from('role_permissions')
    .insert([testRecord])
    .select();

  if (insertError) {
    console.error('❌ Insert error:', insertError.message);
    console.log('\n💡 This tells us what columns the table expects');
  } else {
    console.log('✅ Insert succeeded!');
    console.log('📝 Inserted record:', JSON.stringify(inserted, null, 2));

    // Clean up test record
    if (inserted && inserted.length > 0) {
      await supabase
        .from('role_permissions')
        .delete()
        .eq('id', inserted[0].id);
      console.log('🧹 Cleaned up test record');
    }
  }
}

inspectTable()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
