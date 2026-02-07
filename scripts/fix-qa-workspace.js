const { createClient } = require('@supabase/supabase-js');

// Use service role key to bypass RLS
const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

const QA_COMMUNITY_ID = '3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd';

async function fixQAWorkspace() {
  console.log('=== Creating Workspace for QA Test Community ===\n');

  // First check if workspace already exists
  const { data: existingWorkspace, error: fetchError } = await supabase
    .from('community_workspaces')
    .select('*')
    .eq('community_id', QA_COMMUNITY_ID)
    .maybeSingle();

  if (fetchError) {
    console.error('Error checking existing workspace:', fetchError);
    return;
  }

  if (existingWorkspace) {
    console.log('Workspace already exists:');
    console.log(JSON.stringify(existingWorkspace, null, 2));
    return;
  }

  // Get community info
  const { data: community, error: commError } = await supabase
    .from('growth_communities')
    .select('*')
    .eq('id', QA_COMMUNITY_ID)
    .single();

  if (commError) {
    console.error('Error fetching community:', commError);
    return;
  }

  console.log('Creating workspace for community:', community.name);

  // Create the workspace
  const { data: newWorkspace, error: createError } = await supabase
    .from('community_workspaces')
    .insert({
      community_id: QA_COMMUNITY_ID,
      name: 'Espacio de ' + community.name,
      description: 'Espacio colaborativo para ' + community.name,
      is_active: true,
      settings: {
        features: {
          meetings: true,
          documents: true,
          messaging: true,
          feed: true
        },
        permissions: {
          all_can_post: true,
          all_can_upload: true
        }
      }
    })
    .select('*')
    .single();

  if (createError) {
    console.error('Error creating workspace:', createError);
    return;
  }

  console.log('\nWorkspace created successfully!');
  console.log(JSON.stringify(newWorkspace, null, 2));

  // Verify the workspace was created
  console.log('\n=== Verifying workspace creation ===');
  const { data: verifyWorkspace, error: verifyError } = await supabase
    .from('community_workspaces')
    .select('*, community:growth_communities(*)')
    .eq('community_id', QA_COMMUNITY_ID)
    .single();

  if (verifyError) {
    console.error('Verification failed:', verifyError);
  } else {
    console.log('Verification successful!');
    console.log('Workspace ID:', verifyWorkspace.id);
    console.log('Community:', verifyWorkspace.community?.name);
    console.log('Is Active:', verifyWorkspace.is_active);
  }
}

fixQAWorkspace().catch(console.error);
