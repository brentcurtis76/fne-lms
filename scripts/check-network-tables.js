const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNetworkTables() {
  console.log('Checking if network tables exist...\n');

  try {
    // Check if redes_de_colegios table exists
    const { data: networks, error: networksError } = await supabase
      .from('redes_de_colegios')
      .select('*')
      .limit(1);

    if (networksError) {
      console.error('❌ redes_de_colegios table not found or error:', networksError.message);
      console.log('\nPlease run the migration script: database/add-supervisor-de-red-role.sql');
      return;
    }

    console.log('✅ redes_de_colegios table exists');

    // Check if red_escuelas table exists
    const { data: redEscuelas, error: redEscuelasError } = await supabase
      .from('red_escuelas')
      .select('*')
      .limit(1);

    if (redEscuelasError) {
      console.error('❌ red_escuelas table not found or error:', redEscuelasError.message);
      return;
    }

    console.log('✅ red_escuelas table exists');

    // Check if supervisor_de_red role exists in user_roles
    const { data: roleTypes, error: roleTypesError } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('role_type', 'supervisor_de_red')
      .limit(1);

    if (!roleTypesError && roleTypes?.length === 0) {
      console.log('⚠️  No supervisor_de_red roles assigned yet (this is normal if just created)');
    } else if (roleTypesError) {
      console.error('❌ Error checking user_roles:', roleTypesError.message);
    } else {
      console.log('✅ supervisor_de_red role type is available');
    }

    // Test creating a network
    console.log('\n🧪 Testing network creation...');
    const { data: testNetwork, error: createError } = await supabase
      .from('redes_de_colegios')
      .insert({
        name: 'Test Network - ' + new Date().getTime(),
        description: 'Test network created by check script',
        created_by: '4ae17b21-8977-425c-b05a-ca7cdb8b9df5', // Your user ID
        last_updated_by: '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Failed to create test network:', createError.message);
      console.error('Details:', createError);
    } else {
      console.log('✅ Successfully created test network:', testNetwork.name);
      
      // Clean up test network
      const { error: deleteError } = await supabase
        .from('redes_de_colegios')
        .delete()
        .eq('id', testNetwork.id);
      
      if (deleteError) {
        console.error('⚠️  Could not delete test network:', deleteError.message);
      } else {
        console.log('✅ Test network cleaned up');
      }
    }

    console.log('\n✨ Network tables check complete!');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkNetworkTables();