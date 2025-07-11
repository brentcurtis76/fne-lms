const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addMoraAdminRole() {
  try {
    console.log('Starting admin role assignment for Mora...\n');

    // Get user IDs from profiles table
    console.log('Getting user IDs from profiles table...');
    
    const { data: moraProfile, error: moraError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'mdelfresno@nuevaeducacion.org')
      .single();

    if (moraError) {
      console.error('Error getting Mora\'s profile:', moraError);
      return;
    }
    console.log('Found Mora:', moraProfile);

    const { data: brentProfile, error: brentError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'brent@perrotuertocm.cl')
      .single();

    if (brentError) {
      console.error('Error getting Brent\'s profile:', brentError);
      return;
    }
    console.log('Found Brent:', brentProfile);

    const moraId = moraProfile.id;
    const brentId = brentProfile.id;

    // Check if Mora already has an admin role
    console.log('\nChecking existing roles for Mora...');
    const { data: existingRoles, error: checkError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId);

    if (checkError) {
      console.error('Error checking existing roles:', checkError);
      return;
    }

    console.log('Existing roles for Mora:', existingRoles);

    // Check if admin role already exists
    const hasAdminRole = existingRoles?.some(role => role.role_type === 'admin');
    if (hasAdminRole) {
      console.log('\nMora already has admin role!');
      return;
    }

    // Insert admin role for Mora
    console.log('\nInserting admin role for Mora...');
    const { data: insertData, error: insertError } = await supabase
      .from('user_roles')
      .insert({
        user_id: moraId,
        role_type: 'admin',
        is_active: true,
        assigned_by: brentId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.error('Error inserting admin role:', insertError);
      return;
    }

    console.log('Successfully inserted admin role:', insertData);

    // Verify the insertion
    console.log('\nVerifying the insertion...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId)
      .eq('role_type', 'admin');

    if (verifyError) {
      console.error('Error verifying insertion:', verifyError);
      return;
    }

    console.log('Verification successful! Mora\'s admin role:', verifyData);

    // Show all of Mora's roles
    console.log('\nAll roles for Mora:');
    const { data: allRoles } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId);
    
    console.log(allRoles);

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

addMoraAdminRole();