const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixJavieraCommunityAssignment() {
  try {
    console.log('🔧 Fixing Javiera Raddatz community assignment...\n');

    // 1. Find Javiera
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, school_id')
      .eq('email', 'javiera.raddatzra@liceonacionaldellolleo.cl')
      .single();

    if (profileError || !profile) {
      console.log('❌ Could not find user');
      return;
    }

    console.log('✅ Found user:', profile.first_name, profile.last_name);
    console.log('   User ID:', profile.id);
    console.log('   School ID:', profile.school_id);
    console.log('');

    // 2. Find Liceo community
    const { data: community, error: communityError } = await supabase
      .from('growth_communities')
      .select('id, name')
      .eq('name', 'Comunidad Liceo Nacional de Llolleo')
      .single();

    if (communityError || !community) {
      console.log('❌ Could not find Liceo community');
      return;
    }

    console.log('✅ Found community:', community.name);
    console.log('   Community ID:', community.id);
    console.log('');

    // 3. Check current roles
    const { data: currentRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*, community:growth_communities(name)')
      .eq('user_id', profile.id)
      .eq('is_active', true);

    if (rolesError) {
      console.log('❌ Error checking current roles:', rolesError.message);
      return;
    }

    console.log('📋 Current active roles:');
    currentRoles.forEach(r => {
      console.log('   - Role:', r.role_type);
      console.log('     Community:', r.community?.name || 'None');
      console.log('     ID:', r.id);
    });
    console.log('');

    // 4. Deactivate old community role
    const wrongCommunityRole = currentRoles.find(r => r.community_id !== community.id && r.community_id !== null);
    if (wrongCommunityRole) {
      console.log('🔄 Deactivating incorrect community assignment...');
      const { error: deactivateError } = await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('id', wrongCommunityRole.id);

      if (deactivateError) {
        console.log('❌ Error deactivating old role:', deactivateError.message);
        return;
      }
      console.log('✅ Deactivated role in:', wrongCommunityRole.community?.name);
      console.log('');
    }

    // 5. Create or activate role in correct community
    const correctRole = currentRoles.find(r => r.community_id === community.id);

    if (correctRole) {
      console.log('✅ User already has a role in the correct community');
    } else {
      console.log('➕ Creating new role in correct community...');
      const { data: newRole, error: createError } = await supabase
        .from('user_roles')
        .insert({
          user_id: profile.id,
          school_id: profile.school_id,
          community_id: community.id,
          role_type: 'docente',
          is_active: true
        })
        .select()
        .single();

      if (createError) {
        console.log('❌ Error creating role:', createError.message);
        return;
      }

      console.log('✅ Created docente role in Liceo community');
      console.log('   New role ID:', newRole.id);
    }

    console.log('');
    console.log('🎉 SUCCESS! Javiera now has access to Liceo workspace');
    console.log('');
    console.log('📝 Summary:');
    console.log('   User: Javiera Raddatz');
    console.log('   Community: Comunidad Liceo Nacional de Llolleo');
    console.log('   Role: docente');
    console.log('   Status: active');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

fixJavieraCommunityAssignment();
