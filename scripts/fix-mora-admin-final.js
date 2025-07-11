const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixMoraAdminRole() {
  try {
    console.log('Fixing Mora\'s platform-wide admin role...\n');

    const moraId = 'e4216c21-083c-40b5-9b98-ca81cba11b66';
    const brentId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

    // Get the inactive platform-wide admin role
    const { data: inactiveRole, error: findError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId)
      .eq('role_type', 'admin')
      .eq('is_active', false)
      .is('school_id', null)
      .is('community_id', null)
      .single();

    if (findError) {
      console.error('Error finding inactive role:', findError);
      return;
    }

    console.log('Found inactive platform-wide admin role:', inactiveRole);

    // Activate it (without updated_at since that column doesn't exist)
    console.log('\nActivating the role...');
    const { data: updateData, error: updateError } = await supabase
      .from('user_roles')
      .update({ 
        is_active: true,
        assigned_by: brentId
      })
      .eq('id', inactiveRole.id)
      .select();

    if (updateError) {
      console.error('Error activating role:', updateError);
      return;
    }

    console.log('Successfully activated platform-wide admin role!');
    console.log('Updated role:', updateData);

    // Verify final state
    console.log('\nFinal verification - All active roles for Mora:');
    const { data: activeRoles, error: verifyError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', moraId)
      .eq('is_active', true);

    if (verifyError) {
      console.error('Error verifying roles:', verifyError);
      return;
    }
    
    activeRoles?.forEach(role => {
      const scope = [];
      if (role.school_id) scope.push(`School: ${role.school_id}`);
      if (role.community_id) scope.push(`Community: ${role.community_id}`);
      const scopeStr = scope.length > 0 ? scope.join(', ') : 'Platform-wide';
      
      console.log(`✓ ${role.role_type.toUpperCase()} - ${scopeStr}`);
    });

    console.log('\n✅ SUCCESS! Mora now has platform-wide admin access.');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

fixMoraAdminRole();