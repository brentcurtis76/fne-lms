const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function activateMoraPlatformAdmin() {
  try {
    console.log('Checking Mora\'s admin roles...\n');

    const moraId = 'e4216c21-083c-40b5-9b98-ca81cba11b66';
    const brentId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

    // Get all of Mora's roles
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting roles:', error);
      return;
    }

    console.log('Current roles for Mora:');
    roles.forEach(role => {
      console.log(`- ${role.role_type} (${role.is_active ? 'ACTIVE' : 'INACTIVE'}) - School: ${role.school_id || 'Platform-wide'}, Community: ${role.community_id || 'None'}`);
    });

    // Check for platform-wide admin role (no school_id, no community_id)
    const platformAdminRole = roles.find(role => 
      role.role_type === 'admin' && 
      role.school_id === null && 
      role.community_id === null
    );

    if (platformAdminRole) {
      if (platformAdminRole.is_active) {
        console.log('\nMora already has an ACTIVE platform-wide admin role!');
        return;
      } else {
        // Activate the existing inactive role
        console.log('\nFound INACTIVE platform-wide admin role. Activating it...');
        const { data: updateData, error: updateError } = await supabase
          .from('user_roles')
          .update({ 
            is_active: true,
            assigned_by: brentId,
            updated_at: new Date().toISOString()
          })
          .eq('id', platformAdminRole.id)
          .select();

        if (updateError) {
          console.error('Error activating role:', updateError);
          return;
        }

        console.log('Successfully activated platform-wide admin role:', updateData);
      }
    } else {
      // Insert new platform-wide admin role
      console.log('\nNo platform-wide admin role found. Creating one...');
      const { data: insertData, error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: moraId,
          role_type: 'admin',
          is_active: true,
          assigned_by: brentId,
          school_id: null,
          generation_id: null,
          community_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();

      if (insertError) {
        console.error('Error inserting admin role:', insertError);
        return;
      }

      console.log('Successfully created platform-wide admin role:', insertData);
    }

    // Show final state
    console.log('\nFinal verification - All active roles for Mora:');
    const { data: finalRoles } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId)
      .eq('is_active', true);
    
    finalRoles?.forEach(role => {
      console.log(`- ${role.role_type} - School: ${role.school_id || 'Platform-wide'}, Community: ${role.community_id || 'None'}`);
    });

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

activateMoraPlatformAdmin();