const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupConsultantWorkspaceAccess() {
  console.log('Setting up consultant workspace access...\n');

  try {
    // Get the test consultant
    const { data: consultant } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'consultor.test@fne.org')
      .single();

    if (!consultant) {
      console.error('Test consultant not found');
      return;
    }

    console.log('Found consultant:', consultant.email);

    // Get a growth community with its school
    const { data: community } = await supabase
      .from('growth_communities')
      .select('*, school:schools(*)')
      .limit(1)
      .single();

    if (!community) {
      console.error('No growth community found');
      return;
    }

    console.log('Found community:', community.name);

    // Check if workspace exists for this community
    const { data: existingWorkspace } = await supabase
      .from('community_workspaces')
      .select('*')
      .eq('community_id', community.id)
      .single();

    let workspace;
    if (existingWorkspace) {
      workspace = existingWorkspace;
      console.log('Using existing workspace:', workspace.id);
    } else {
      // Create workspace
      const { data: newWorkspace, error: workspaceError } = await supabase
        .from('community_workspaces')
        .insert({
          community_id: community.id,
          name: `Espacio de ${community.name}`,
          is_active: true
        })
        .select()
        .single();

      if (workspaceError) {
        console.error('Error creating workspace:', workspaceError);
        return;
      }

      workspace = newWorkspace;
      console.log('Created new workspace:', workspace.id);
    }

    // For consultants to access the workspace, they need to be in the community
    // The consultant_assignments table is for consultant-student relationships
    // So we'll skip this part and just ensure the consultant has the community_id set

    // Also update the consultant's profile to have the community and school
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        community_id: community.id,
        school_id: community.school_id
      })
      .eq('id', consultant.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    } else {
      console.log('✅ Updated consultant profile with community');
    }

    // Create or update user_roles entry
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', consultant.id)
      .single();

    if (!existingRole) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: consultant.id,
          role_type: 'consultor',
          school_id: community.school_id,
          community_id: community.id
        });

      if (roleError) {
        console.error('Error creating user role:', roleError);
      } else {
        console.log('✅ Created user role entry');
      }
    } else {
      const { error: roleUpdateError } = await supabase
        .from('user_roles')
        .update({
          school_id: community.school_id,
          community_id: community.id
        })
        .eq('user_id', consultant.id);

      if (roleUpdateError) {
        console.error('Error updating user role:', roleUpdateError);
      } else {
        console.log('✅ Updated user role with community');
      }
    }

    console.log('\n✅ Setup complete!');
    console.log(`Consultant ${consultant.email} now has access to the ${community.name} workspace.`);
    console.log('They can now access:');
    console.log('- Vista General (Overview)');
    console.log('- Reuniones (Meetings)');
    console.log('- Documentos (Documents)');
    console.log('- Mensajes (Messages)');
    console.log('- Tareas Grupales (Group Assignments)');

  } catch (error) {
    console.error('Failed:', error);
  }
}

setupConsultantWorkspaceAccess();