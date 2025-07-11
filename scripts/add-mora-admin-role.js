const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addMoraAdminRole() {
  try {
    console.log('Starting admin role assignment for Mora...\n');

    // Step 1: Get Mora's user ID
    console.log('Step 1: Getting Mora\'s user ID...');
    const { data: moraData, error: moraError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', 'mdelfresno@nuevaeducacion.org')
      .single();

    if (moraError) {
      // Try alternative approach using RPC
      const { data: moraRpc, error: moraRpcError } = await supabase
        .rpc('get_user_id_by_email', { email_param: 'mdelfresno@nuevaeducacion.org' });
      
      if (moraRpcError) {
        console.error('Error getting Mora\'s user ID:', moraRpcError);
        return;
      }
      
      const moraId = moraRpc?.[0]?.id;
      if (!moraId) {
        console.error('Mora\'s user not found');
        return;
      }
      console.log('Mora\'s user ID:', moraId);
    } else {
      const moraId = moraData.id;
      console.log('Mora\'s user ID:', moraId);
    }

    // Step 2: Get Brent's user ID
    console.log('\nStep 2: Getting Brent\'s user ID...');
    const { data: brentData, error: brentError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('email', 'brent@perrotuertocm.cl')
      .single();

    if (brentError) {
      // Try alternative approach using RPC
      const { data: brentRpc, error: brentRpcError } = await supabase
        .rpc('get_user_id_by_email', { email_param: 'brent@perrotuertocm.cl' });
      
      if (brentRpcError) {
        console.error('Error getting Brent\'s user ID:', brentRpcError);
        return;
      }
      
      const brentId = brentRpc?.[0]?.id;
      if (!brentId) {
        console.error('Brent\'s user not found');
        return;
      }
      console.log('Brent\'s user ID:', brentId);
    } else {
      const brentId = brentData.id;
      console.log('Brent\'s user ID:', brentId);
    }

    // Let's first check if we can access the profiles table to get IDs
    console.log('\nChecking profiles table for user IDs...');
    
    const { data: moraProfile, error: moraProfileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'mdelfresno@nuevaeducacion.org')
      .single();

    if (moraProfileError) {
      console.error('Error getting Mora\'s profile:', moraProfileError);
    } else {
      console.log('Mora\'s profile:', moraProfile);
    }

    const { data: brentProfile, error: brentProfileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'brent@perrotuertocm.cl')
      .single();

    if (brentProfileError) {
      console.error('Error getting Brent\'s profile:', brentProfileError);
    } else {
      console.log('Brent\'s profile:', brentProfile);
    }

    if (!moraProfile || !brentProfile) {
      console.error('Unable to find required user profiles');
      return;
    }

    const moraId = moraProfile.id;
    const brentId = brentProfile.id;

    // Step 3: Check if Mora already has an admin role
    console.log('\nStep 3: Checking if Mora already has admin role...');
    const { data: existingRole, error: checkError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId)
      .eq('role_type', 'admin')
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking existing role:', checkError);
      return;
    }

    if (existingRole) {
      console.log('Mora already has admin role:', existingRole);
      return;
    }

    // Step 4: Insert admin role for Mora
    console.log('\nStep 4: Inserting admin role for Mora...');
    const { data: insertData, error: insertError } = await supabase
      .from('user_roles')
      .insert({
        user_id: moraId,
        role_type: 'admin',
        is_active: true,
        assigned_by: brentId
      })
      .select();

    if (insertError) {
      console.error('Error inserting admin role:', insertError);
      return;
    }

    console.log('Successfully inserted admin role:', insertData);

    // Step 5: Verify the insertion
    console.log('\nStep 5: Verifying the insertion...');
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

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

addMoraAdminRole();